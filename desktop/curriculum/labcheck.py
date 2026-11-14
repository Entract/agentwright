"""Runs and checks guided-course exercises with the Python installed on the PC.

    python labcheck.py run <ID> <dir>       run <dir>/main.py with the exercise's fixtures defined
    python labcheck.py live <ID> <dir>      as run, but with the network allowed; only for the few
                                            exercises that are marked as able to make a real request
    python labcheck.py check <ID> <dir>     run every test case; prints one line of JSON
    python labcheck.py solution <ID>        print the reference solution (explicit learner action only)
    python labcheck.py info                 JSON: implemented exercise IDs, Python and SDK versions

Content comes from manifest.json (the canonical curriculum; IDs are never renumbered).
The executable tests live in checks_*.py and the answer key in answers/, both kept
apart from anything shown to the learner.

Every test case runs the learner's program from the top in a fresh namespace with
fresh fixtures, so cases cannot affect each other. Checks and ordinary runs never use
the network: outgoing connections are blocked while exercise code runs. Only the "live"
command lifts that, and only the app's explicit, confirmed "Run live" action uses it.
"""
from __future__ import annotations

import ast
import builtins
import contextlib
import functools
import importlib
import io
import json
import linecache
import os
import socket
import sys
import threading
import time
import traceback
import types

HERE = os.path.dirname(os.path.abspath(__file__))
MAIN = "main.py"
MAX_OUTPUT = 20000
CHECK_TIME_LIMIT = 30.0
# One test case (one run of the learner's program, or one call into it) may take this long.
CASE_TIME_LIMIT = 3.0

with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as _fh:
    MANIFEST = json.load(_fh)
EXERCISES = {e["id"]: e for e in MANIFEST["exercises"]}
FIXTURES = MANIFEST["fixtures"]

# Exercise ID -> list of Case. Filled in by the checks_*.py modules.
CHECKS: dict[str, list["Case"]] = {}
# Exercise ID -> options: {"files": {...starter workspace...}, "entry": "main.py", "explanation": [...]}
OPTIONS: dict[str, dict] = {}
# Undo steps registered by a case's setup; run when that case's program has finished.
CLEANUPS: list = []


class Fail(Exception):
    """Raised by a check to say what was observed and what was expected."""


class TimeLimit(BaseException):
    """The learner's code ran past the limit for one case (usually a loop that never ends)."""


@contextlib.contextmanager
def watched(run, names, seconds=None):
    """Counts calls to the learner's own functions and stops code that runs too long.

    Only the learner's files are traced line by line, so library code runs at full speed.
    """
    deadline = time.monotonic() + (seconds or CASE_TIME_LIMIT)
    ticks = 0

    def local(frame, event, _arg):
        nonlocal ticks
        if event == "line":
            ticks += 1
            if ticks % 200 == 0 and time.monotonic() > deadline:
                raise TimeLimit()
        return local

    def tracer(frame, event, _arg):
        if event == "call" and frame.f_code.co_filename in names:
            name = frame.f_code.co_name
            run.defined_calls[name] = run.defined_calls.get(name, 0) + 1
            return local
        return None

    previous = sys.gettrace()
    sys.settrace(tracer)
    try:
        yield
    finally:
        sys.settrace(previous)


TIME_LIMIT_MESSAGE = "did not finish within a few seconds. Is there a loop that never ends, or a loop whose condition never changes?"


def need(condition, message):
    if not condition:
        raise Fail(message)


class Case:
    def __init__(self, name, check, setup=None, visible=False, concept=""):
        self.name = name
        self.check = check
        self.setup = setup
        self.visible = visible
        self.concept = concept


class Builder:
    """Collects the cases of one exercise. The first visible case mirrors the prompt's own fixture."""

    def __init__(self, exercise_id):
        self.cases: list[Case] = []
        self.exercise_id = exercise_id

    def visible(self, name, check, setup=None, concept=""):
        self.cases.append(Case(name, check, setup, True, concept))

    def hidden(self, name, check, setup=None, concept=""):
        self.cases.append(Case(name, check, setup, False, concept))

    def options(self, **options):
        OPTIONS.setdefault(self.exercise_id, {}).update(options)


def checks(exercise_id):
    assert exercise_id in EXERCISES, exercise_id

    def register(fn):
        builder = Builder(exercise_id)
        fn(builder)
        CHECKS[exercise_id] = builder.cases
        return fn

    return register


# ---------------------------------------------------------------- running learner code


class _Output(io.StringIO):
    def write(self, s):
        if self.tell() + len(s) > MAX_OUTPUT:
            raise RuntimeError("Output limit exceeded. Is a loop printing forever?")
        return super().write(s)


def _no_input(prompt=""):
    raise RuntimeError("input() is not available in guided exercises. Use the values already defined.")


def _blocked(*_args, **_kwargs):
    raise OSError("Guided exercises run offline: network connections are blocked here.")


@contextlib.contextmanager
def offline():
    """No exercise needs the network; blocking it guarantees nothing here can call an API."""
    saved = (socket.socket.connect, socket.socket.connect_ex, socket.create_connection)
    socket.socket.connect = _blocked
    socket.socket.connect_ex = _blocked
    socket.create_connection = _blocked
    try:
        yield
    finally:
        socket.socket.connect, socket.socket.connect_ex, socket.create_connection = saved


class Run:
    """What happened when the learner's program ran once."""

    def __init__(self):
        self.ns: dict = {}
        self.stdout = ""
        self.error: dict | None = None
        self.calls: dict[str, list[tuple]] = {}
        self.source = ""
        self.files: dict[str, str] = {}
        self.explanation = ""
        self.defined_calls: dict[str, int] = {}
        self.call_output = ""
        self.workdir: str | None = None

    def module(self, name):
        """A freshly imported module from the learner's workspace (timed projects have several files)."""
        need(f"{name}.py" in self.files, f"The workspace has no file named {name}.py.")
        _purge(self.workdir, self.files)
        try:
            with contextlib.redirect_stdout(_Output()), offline(), watched(self, self.traced()):
                return importlib.import_module(name)
        except TimeLimit:
            raise Fail(f"Importing {name}.py {TIME_LIMIT_MESSAGE}") from None
        except BaseException as exc:  # noqa: BLE001
            raise Fail(f"{name}.py could not be imported: {type(exc).__name__}: {exc}") from None

    def traced(self):
        """File names whose code counts as the learner's: as compiled here, and as imported from the workspace."""
        names = set(self.files)
        if self.workdir:
            names |= {os.path.join(self.workdir, name) for name in self.files}
        return names

    def invoke(self, fn, *args, **kwargs):
        """Calls any function from the learner's workspace with the same protection as `call`."""
        label = getattr(fn, "__name__", "the function")
        try:
            with contextlib.redirect_stdout(_Output()), offline(), watched(self, self.traced()):
                return fn(*args, **kwargs)
        except Fail:
            raise
        except TimeLimit:
            raise Fail(f"`{label}` {TIME_LIMIT_MESSAGE}") from None
        except BaseException as exc:  # noqa: BLE001
            raise Fail(f"`{label}` stopped with {type(exc).__name__}: {_clip(exc, 200)}") from None

    def called(self, name):
        """How many times a function ran. Fixture functions are spied on; functions the learner defines are counted as they run."""
        if name in self.calls:
            return len(self.calls[name])
        return self.defined_calls.get(name, 0)

    def lines(self):
        return [line.rstrip() for line in self.stdout.splitlines() if line.strip()]

    def get(self, name, what=None):
        """A variable or function the task asks for; a clear failure when it is missing."""
        if name not in self.ns:
            raise Fail(f"Expected {what or 'a variable'} named `{name}`, but your program did not define it.")
        return self.ns[name]

    def call(self, name, *args, **kwargs):
        """Calls a function the learner defined, reporting a crash as a failure."""
        fn = self.get(name, "a function")
        need(callable(fn), f"`{name}` should be a function, but it is {type(fn).__name__}.")
        shown = ", ".join([repr(a) for a in args] + [f"{k}={v!r}" for k, v in kwargs.items()])
        out = _Output()
        try:
            with contextlib.redirect_stdout(out), offline(), watched(self, self.traced()):
                return fn(*args, **kwargs)
        except Fail:
            raise
        except TimeLimit:
            raise Fail(f"`{name}({_clip(shown)})` {TIME_LIMIT_MESSAGE}") from None
        except BaseException as exc:  # noqa: BLE001 - learner code may raise anything
            raise Fail(f"`{name}({_clip(shown)})` stopped with {type(exc).__name__}: {exc}") from None
        finally:
            self.call_output = out.getvalue()


def _purge(workdir, files=()):
    """Forgets modules imported from the workspace, so the next import reads the files again.

    Modules are also dropped by name (agent, tools, ...), and the workspace is put first on the
    import path, so a same-named module from another folder can never be picked up instead.
    """
    if not workdir:
        return
    folder = os.path.normcase(os.path.abspath(workdir))
    own_names = {name[:-3] for name in files if name.endswith(".py")}
    for name, module in list(sys.modules.items()):
        path = getattr(module, "__file__", None) or ""
        if name in own_names or (path and os.path.normcase(os.path.dirname(os.path.abspath(path))) == folder):
            del sys.modules[name]
    workdir = os.path.abspath(workdir)
    if not sys.path or sys.path[0] != workdir:
        if workdir in sys.path:
            sys.path.remove(workdir)
        sys.path.insert(0, workdir)
    importlib.invalidate_caches()


def _clip(text, limit=140):
    text = str(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _spy(name, fn, calls):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        # Lists are copied as they are at this moment: a history that is extended later
        # must not change what this call is recorded as having received.
        seen = tuple(list(a) if isinstance(a, list) else a for a in args)
        calls.setdefault(name, []).append((seen, {k: list(v) if isinstance(v, list) else v for k, v in kwargs.items()}))
        return fn(*args, **kwargs)

    wrapper.__lab_spy__ = True
    return wrapper


def _register_source(filename, source):
    lines = source.splitlines(keepends=True)
    linecache.cache[filename] = (len(source), None, lines, filename)


def _describe_error(exc, filenames):
    """The exception with only the learner's own frames, the way a short traceback reads."""
    tb = traceback.TracebackException.from_exception(exc)
    frames = [f for f in tb.stack if f.filename in filenames]
    for frame in frames:
        frame.filename = os.path.basename(frame.filename)
    line = frames[-1].lineno if frames else None
    if isinstance(exc, SyntaxError) and exc.filename in filenames:
        line = exc.lineno
        tb.filename = os.path.basename(exc.filename)
    text = "Traceback (most recent call last):\n" if frames else ""
    text += "".join(traceback.StackSummary.from_list(frames).format())
    text += "".join(tb.format_exception_only())
    return {"type": type(exc).__name__, "message": str(exc), "line": line, "traceback": text.rstrip()}


def build_namespace(exercise, setup=None, calls=None):
    """The fixtures the prompt lists, defined exactly as the manifest gives them."""
    ns = {"__name__": "__main__", "__builtins__": builtins}
    for name in exercise["fixtures"]:
        exec(compile(FIXTURES[name], f"<fixture {name}>", "exec"), ns)
    for name, source in OPTIONS.get(exercise["id"], {}).get("extra_fixtures", {}).items():
        exec(compile(source, f"<fixture {name}>", "exec"), ns)
    if setup:
        setup(ns)
    if calls is not None:
        for name, value in list(ns.items()):
            if isinstance(value, types.FunctionType) and not getattr(value, "__lab_spy__", False):
                ns[name] = _spy(name, value, calls)
    return ns


def execute(exercise, files, setup=None, workdir=None, explanation=""):
    """Runs the learner's program once, from the top, in a fresh namespace."""
    run = Run()
    entry = OPTIONS.get(exercise["id"], {}).get("entry", MAIN)
    run.files = dict(files)
    run.source = files.get(entry, "")
    run.explanation = explanation
    for name, text in files.items():
        _register_source(name, text)
    run.workdir = os.path.abspath(workdir) if workdir else None
    out = _Output()
    saved_input = builtins.input
    _purge(run.workdir, files)
    try:
        run.ns = build_namespace(exercise, setup, run.calls)
        if run.workdir:
            run.ns["__file__"] = os.path.join(run.workdir, entry)
        code = compile(run.source, entry, "exec")
        builtins.input = _no_input
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out), offline(), watched(run, run.traced()):
            exec(code, run.ns)
    except TimeLimit:
        run.error = {"type": "TimeLimit", "message": "Your program " + TIME_LIMIT_MESSAGE, "line": None, "traceback": ""}
    except SystemExit:
        pass
    except BaseException as exc:  # noqa: BLE001
        run.error = _describe_error(exc, run.traced())
    finally:
        builtins.input = saved_input
        _purge(run.workdir, files)
        # A case's setup may have changed something outside the learner's namespace (a stand-in
        # module, an environment variable); what it registered here puts that back.
        while CLEANUPS:
            CLEANUPS.pop()()
    run.stdout = out.getvalue()
    return run


# ---------------------------------------------------------------- helpers for checks


def plain(value):
    """SDK objects as ordinary dicts and lists, so a check can compare meaning rather than type."""
    if hasattr(value, "model_dump"):
        value = value.model_dump()
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value


def block_key(block):
    """The fields that identify a content block, whether it is an SDK object or a dict."""
    b = plain(block)
    if not isinstance(b, dict):
        return ("?", repr(b))
    kind = b.get("type")
    if kind == "tool_use":
        return ("tool_use", b.get("id"), b.get("name"), json.dumps(b.get("input"), sort_keys=True))
    if kind == "text":
        return ("text", b.get("text"))
    if kind == "tool_result":
        return ("tool_result", b.get("tool_use_id"))
    return (kind, json.dumps(b, sort_keys=True, default=str))


def same_content(actual, expected):
    try:
        return [block_key(b) for b in actual] == [block_key(b) for b in expected]
    except TypeError:
        return False


def printed_values(run):
    """Each printed line read back as a Python value where possible (a printed dict becomes a dict)."""
    values = []
    for line in run.lines():
        try:
            values.append(ast.literal_eval(line.strip()))
        except (ValueError, SyntaxError):
            values.append(line.strip())
    return values


def no_crash(run):
    if run.error and run.error["type"] == "TimeLimit":
        raise Fail(run.error["message"])
    if run.error:
        where = f" on line {run.error['line']}" if run.error.get("line") else ""
        raise Fail(f"Your program stopped with {run.error['type']}{where}: {_clip(run.error['message'], 200)}")


def expect_lines(run, expected, what="The output"):
    no_crash(run)
    actual = run.lines()
    expected = [str(e) for e in expected]
    if actual == expected:
        return
    if not actual:
        raise Fail(f"{what} was empty; expected {len(expected)} line(s). Is something printed?" if expected else "")
    raise Fail(f"{what} was {_clip(actual)}; expected {_clip(expected)}.")


def uses_any(run, names):
    """Names from `names` that the learner's source calls or reads (for example eval or exec)."""
    try:
        tree = ast.parse(run.source)
    except SyntaxError:
        return []
    return sorted({n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id in names})


def sdk_message(blocks, stop_reason="tool_use", message_id="msg_case"):
    from anthropic.types import Message

    return Message.model_validate(
        {
            "id": message_id,
            "type": "message",
            "role": "assistant",
            "model": "claude-opus-5-5",
            "content": blocks,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }
    )


def text(value):
    return {"type": "text", "text": value}


def tool(tool_id, name, tool_input):
    return {"type": "tool_use", "id": tool_id, "name": name, "input": tool_input}


def with_response(blocks, stop_reason="tool_use"):
    """A setup step that swaps in a different simulated SDK response."""

    def setup(ns):
        ns["response"] = sdk_message(blocks, stop_reason)

    return setup


def with_values(**values):
    def setup(ns):
        ns.update(values)

    return setup


def parse_json_content(block, label="content"):
    """The `content` of a tool_result, which the task asks to be a JSON string."""
    content = block.get("content") if isinstance(block, dict) else None
    need(isinstance(content, str), f"The tool_result `{label}` should be a JSON string made with json.dumps, but it is {type(content).__name__}.")
    try:
        return json.loads(content)
    except ValueError:
        raise Fail(f"The tool_result `{label}` is a string but not valid JSON: {_clip(content, 80)!r}. Use json.dumps on the tool's returned dictionary.") from None


BALANCE = {"balance_id": "XPR205", "mass": 10.52, "unit": "g"}
TEMPERATURE = {"sensor_id": "TEMP02", "temperature": 22.4, "unit": "C"}


def balance(balance_id="XPR205"):
    return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}


def temperature(sensor_id="TEMP02"):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}


# ---------------------------------------------------------------- commands


def _load_checks():
    import importlib

    for name in sorted(os.listdir(HERE)):
        if name.startswith("checks_") and name.endswith(".py"):
            importlib.import_module(name[:-3])


def with_locked_files(exercise_id, files, directory=None):
    """Files the app supplies and the learner cannot change (the simulated Claude) are put back as shipped."""
    files = dict(files)
    for name, source in OPTIONS.get(exercise_id, {}).get("locked", {}).items():
        files[name] = source
        if directory:
            with open(os.path.join(directory, name), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(source)
    return files


def read_workspace(directory, exercise_id):
    files = {}
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name)
        if os.path.isfile(path) and name.endswith((".py", ".json")):
            with open(path, encoding="utf-8") as fh:
                files[name] = fh.read()
    files = with_locked_files(exercise_id, files, directory)
    explanation = ""
    note = os.path.join(directory, "explanation.txt")
    if os.path.isfile(note):
        with open(note, encoding="utf-8") as fh:
            explanation = fh.read()
    return files, explanation


def check_exercise(exercise_id, files, explanation="", workdir=None):
    """Runs every case of one exercise and returns the report as a dict."""
    exercise = EXERCISES[exercise_id]
    entry = OPTIONS.get(exercise_id, {}).get("entry", MAIN)
    files = with_locked_files(exercise_id, files, workdir)
    report = {"exercise": exercise_id, "syntaxError": None, "cases": [], "explanation": [], "timedOut": False}
    for name, source in files.items():
        if not name.endswith(".py"):
            continue
        try:
            compile(source, name, "exec")
        except SyntaxError as exc:
            report["syntaxError"] = {"file": name, "line": exc.lineno, "message": exc.msg, "text": (exc.text or "").rstrip()}
            break
    if report["syntaxError"] is None:
        if workdir and workdir not in sys.path:
            sys.path.insert(0, workdir)
        for case in CHECKS.get(exercise_id, []):
            entry_result = {"name": case.name, "visible": case.visible, "passed": False, "message": "", "concept": case.concept}
            report["cases"].append(entry_result)
            try:
                run = execute(exercise, files, case.setup, workdir, explanation)
                case.check(run)
                entry_result["passed"] = True
            except Fail as failure:
                entry_result["message"] = str(failure)
            except BaseException as exc:  # noqa: BLE001 - a broken check must not look like a learner error
                entry_result["message"] = f"The checker itself failed on this case ({type(exc).__name__}: {exc}). Please report it."
                entry_result["checkerError"] = True
        for rubric in OPTIONS.get(exercise_id, {}).get("explanation", []):
            report["explanation"].append(_grade_explanation(rubric, explanation))
    code_cases = report["cases"]
    report["passed"] = sum(1 for c in code_cases if c["passed"])
    report["total"] = len(code_cases)
    needs_text = bool(OPTIONS.get(exercise_id, {}).get("explanation"))
    report["explanationMissing"] = needs_text and len(explanation.split()) < 8
    report["ok"] = report["syntaxError"] is None and report["total"] > 0 and report["passed"] == report["total"] and not report["explanationMissing"]
    report["entry"] = entry
    return report


def _grade_explanation(rubric, explanation):
    """A rough keyword check of a written answer. It is reported apart from the code and never blocks it."""
    lowered = explanation.lower()
    found = any(all(word in lowered for word in group) for group in rubric["any"])
    return {"point": rubric["point"], "found": found}


def _watchdog(report_holder):
    def expire():
        report = report_holder.get("report") or {"cases": [], "explanation": []}
        report.update({"timedOut": True, "ok": False})
        report.setdefault("exercise", report_holder.get("id"))
        report["passed"] = sum(1 for c in report.get("cases", []) if c.get("passed"))
        report["total"] = len(CHECKS.get(report_holder.get("id"), []))
        sys.__stdout__.write(json.dumps(report) + "\n")
        sys.__stdout__.flush()
        os._exit(3)

    timer = threading.Timer(CHECK_TIME_LIMIT, expire)
    timer.daemon = True
    timer.start()
    return timer


def command_check(exercise_id, directory):
    _load_checks()
    files, explanation = read_workspace(directory, exercise_id)
    holder = {"id": exercise_id}
    timer = _watchdog(holder)
    report = check_exercise(exercise_id, files, explanation, os.path.abspath(directory))
    timer.cancel()
    print(json.dumps(report))
    return 0


def command_run(exercise_id, directory, live=False):
    """Run: the raw program with its fixtures, output straight to the console."""
    _load_checks()
    if live and not OPTIONS.get(exercise_id, {}).get("live"):
        print(f"{exercise_id} is a simulated exercise and cannot make real requests.", file=sys.stderr)
        return 2
    if not live:
        # An ordinary run is always the simulation, whatever is set in Windows.
        os.environ.pop("LAB_AGENT_LIVE", None)
    exercise = EXERCISES[exercise_id]
    files, _ = read_workspace(directory, exercise_id)
    entry = OPTIONS.get(exercise_id, {}).get("entry", MAIN)
    for name, source in files.items():
        _register_source(name, source)
    directory = os.path.abspath(directory)
    if directory not in sys.path:
        sys.path.insert(0, directory)
    try:
        ns = build_namespace(exercise)
        ns["__file__"] = os.path.join(directory, entry)
        code = compile(files.get(entry, ""), entry, "exec")
        with contextlib.nullcontext() if live else offline():
            exec(code, ns)
    except SystemExit as exc:
        return exc.code if isinstance(exc.code, int) else 0
    except BaseException as exc:  # noqa: BLE001
        sys.stdout.flush()
        print(_describe_error(exc, set(files) | {os.path.join(directory, name) for name in files})["traceback"], file=sys.stderr)
        return 1
    return 0


def answer_key():
    """(SOLUTIONS, WRONG) merged from the answer_key_*.py modules. Loaded only on request."""
    import importlib

    solutions, wrong = {}, {}
    for name in sorted(os.listdir(HERE)):
        if name.startswith("answer_key_") and name.endswith(".py"):
            module = importlib.import_module(name[:-3])
            solutions.update(module.SOLUTIONS)
            wrong.update(module.WRONG)
    return solutions, wrong


def command_solution(exercise_id):
    solutions, _ = answer_key()
    solution = solutions.get(exercise_id)
    if solution is None:
        print("No reference solution is stored for this exercise.")
        return 1
    if isinstance(solution, dict):
        for name, source in solution.items():
            print(f"# ---- {name} ----")
            print(source.rstrip())
            print()
    else:
        print(solution.rstrip())
    return 0


def command_info():
    _load_checks()
    info = {"implemented": sorted(CHECKS), "python": sys.version.split()[0], "anthropic": None, "workspaces": {}}
    try:
        import anthropic

        info["anthropic"] = anthropic.__version__
    except Exception as exc:  # noqa: BLE001
        info["anthropicError"] = f"{type(exc).__name__}: {exc}"
    for exercise_id, options in OPTIONS.items():
        extra = {k: options[k] for k in ("files", "entry", "readonly", "note", "extra_fixtures", "interactive", "previous", "live") if k in options}
        if options.get("locked"):
            extra["files"] = {**extra.get("files", {}), **options["locked"]}
            extra["readonly"] = sorted(set(extra.get("readonly", [])) | set(options["locked"]))
        if options.get("explanation"):
            extra["explanation"] = True
        if extra:
            info["workspaces"][exercise_id] = extra
    print(json.dumps(info))
    return 0


def main(argv):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    if len(argv) >= 2 and argv[1] == "info":
        return command_info()
    if len(argv) >= 3 and argv[1] == "solution" and argv[2] in EXERCISES:
        return command_solution(argv[2])
    if len(argv) >= 4 and argv[1] == "live" and argv[2] in EXERCISES:
        return command_run(argv[2], argv[3], live=True)
    if len(argv) >= 4 and argv[1] in ("run", "check") and argv[2] in EXERCISES:
        return (command_run if argv[1] == "run" else command_check)(argv[2], argv[3])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    # Importing this file as "labcheck" from the checks modules must give this same module.
    sys.modules.setdefault("labcheck", sys.modules[__name__])
    sys.exit(main(sys.argv))
