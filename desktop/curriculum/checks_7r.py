"""Reading unfamiliar Python (7R-A..7R-F): imports, classes and self, tracebacks and exceptions,
type hints and f-strings, decorators, one-line loops. Added to the pack's 58 exercises."""
import ast

from labcheck import Fail, balance, checks, need, no_crash, printed_values, text, tool, with_response

INSTRUMENTS = '''"""Simulated instruments. This file is supplied for the exercise and cannot be changed."""


def read_balance(balance_id):
    return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}


def check_temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}
'''


def tree_of(run):
    try:
        return ast.parse(run.source)
    except SyntaxError:
        raise Fail("The program has a syntax error.") from None


def answer(run, name):
    value = run.get(name)
    need(value is not None, f"`{name}` is still None.")
    return value


# --------------------------------------------------------------------------- 7R-A

@checks("7R-A")
def _(c):
    c.options(locked={"instruments.py": INSTRUMENTS}, note="`instruments.py` is a second tab, read only. Importing from a file beside your program works here exactly as it does on your own PC.")

    def three(run):
        no_crash(run)
        values = printed_values(run)
        need(values == [balance()] * 3, f"The program should print the same reading three times, once per way of importing; it printed {run.lines()[:4] or 'nothing'}.")

    c.visible("The same reading is printed three times", three)

    def forms(run):
        no_crash(run)
        tree = tree_of(run)
        from_imports = [n for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module == "instruments"]
        need(any(alias.name == "read_balance" and alias.asname is None for n in from_imports for alias in n.names), "One import should be `from instruments import read_balance`, bringing in the function by its own name.")
        plain = [alias for n in ast.walk(tree) if isinstance(n, ast.Import) for alias in n.names if alias.name == "instruments"]
        need(any(alias.asname == "lab" for alias in plain), "One import should be `import instruments as lab`.")
        need(any(alias.asname is None for alias in plain), "Keep the first form, `import instruments`, as well.")

    c.visible("All three forms of import are used", forms, concept="Three spellings, one file")

    def calls(run):
        no_crash(run)
        tree = tree_of(run)
        called = [n.func for n in ast.walk(tree) if isinstance(n, ast.Call)]
        need(any(isinstance(f, ast.Name) and f.id == "read_balance" for f in called), "After `from instruments import read_balance`, call it directly: `read_balance(\"XPR205\")`.")
        need(any(isinstance(f, ast.Attribute) and f.attr == "read_balance" and isinstance(f.value, ast.Name) and f.value.id == "lab" for f in called), "After `import instruments as lab`, call it through the short name: `lab.read_balance(\"XPR205\")`.")
        need(not any(isinstance(n, ast.FunctionDef) for n in ast.walk(tree)), "Do not define a function in main.py; the point is to reach the one in instruments.py.")

    c.hidden("Each import is actually used, and nothing is copied", calls, concept="An imported name is used the way it was imported")


# --------------------------------------------------------------------------- 7R-B

@checks("7R-B")
def _(c):
    def made(run):
        no_crash(run)
        cls = run.ns["Balance"]
        made_balance = answer(run, "balance")
        need(isinstance(made_balance, cls), f"`balance` should be a Balance object, made with Balance(\"XPR205\"); it is {type(made_balance).__name__}.")
        need(made_balance.balance_id == "XPR205", f"`balance` is for {made_balance.balance_id!r}; it should be for \"XPR205\".")
        need(made_balance.readings == 2, f"`balance` should have been read exactly twice; it has been read {made_balance.readings} time(s).")
        need(run.get("result") == balance(), f"`result` should be the reading dictionary that read() returns; it is {run.get('result')!r}.")

    c.visible("balance is made, read twice, and result holds a reading", made)

    def counted(run):
        no_crash(run)
        need(run.get("count") == 2, f"`count` should be 2, taken from the object; it is {run.get('count')!r}.")
        names = {n.attr for n in ast.walk(tree_of(run)) if isinstance(n, ast.Attribute)}
        need("readings" in names, "Read the count from the object: `balance.readings`. Typing 2 would be wrong the moment the code changes.")

    c.visible("count is read from the object", counted, concept="An attribute is data stored on the object")

    def second(run):
        no_crash(run)
        cls = run.ns["Balance"]
        other = answer(run, "other")
        need(isinstance(other, cls) and other is not run.ns.get("balance"), "`other` should be a second, separate Balance object.")
        need(other.balance_id == "AB104" and other.unit == "mg", f"`other` should be for \"AB104\" with the unit \"mg\"; it has {other.balance_id!r} and {other.unit!r}.")
        need(other.readings == 0, f"`other` has been read {other.readings} time(s). Each object keeps its own count; only `balance` should be read.")
        need(run.lines()[-1:] == ["mg"], f"The last line printed should be other.unit, mg; the output ended with {run.lines()[-1:]}.")

    c.hidden("other is a separate object with its own data", second, concept="Each object has its own copy of the attributes")


# --------------------------------------------------------------------------- 7R-C

@checks("7R-C")
def _(c):
    def reads(run):
        no_crash(run)
        need(answer(run, "error_type") == "KeyError", f"`error_type` is {run.ns['error_type']!r}. The exception's name is at the start of the traceback's last line.")
        need(answer(run, "missing_key") == "sensor", f"`missing_key` is {run.ns['missing_key']!r}. The last line's message is the key that was asked for.")
        need(answer(run, "failed_in") == "run_tool", f"`failed_in` is {run.ns['failed_in']!r}. Look at the last `File ... in ...` line: that is where it happened; the ones above are the callers.")
        need(answer(run, "failed_line") == 17, f"`failed_line` is {run.ns['failed_line']!r}; it should be the number 17, from that same line.")

    c.visible("The four answers match the traceback", reads, concept="Read a traceback from the bottom up")

    def caught(run):
        no_crash(run)
        need(run.get("outcome") == "missing key: 'sensor'", f"`outcome` should be \"missing key: 'sensor'\"; it is {run.get('outcome')!r}.")
        need(run.called("run_tool") == 1, f"`run_tool` should be called once; it was called {run.called('run_tool')} time(s).")

    c.visible("The KeyError is caught and described", caught, concept="except names the kind of error it handles")

    def works(run):
        no_crash(run)
        need(run.get("outcome") == {"sensor_id": "TEMP02", "temperature": 22.4, "unit": "C"}, f"When `run_tool` works, `outcome` should be what it returned; it is {run.get('outcome')!r}. Assign the call's result inside `try`.")

    def fixed(ns):
        ns["run_tool"] = lambda name, tool_input: {"sensor_id": tool_input["sensor_id"], "temperature": 22.4, "unit": "C"}

    c.hidden("With a working run_tool, outcome is its result", works, fixed, "The try block's own result is kept when nothing goes wrong")

    def narrow(run):
        handlers = [n for n in ast.walk(tree_of(run)) if isinstance(n, ast.ExceptHandler)]
        need(handlers, "Use try and except around the call.")
        need(all(h.type is not None for h in handlers), "A bare `except:` hides every kind of problem, including typing mistakes. Name the error: `except KeyError as exc:`.")

    c.hidden("The except names the error it expects", narrow, concept="Catch what you expect; let surprises show")


# --------------------------------------------------------------------------- 7R-D

@checks("7R-D")
def _(c):
    def predicted(run):
        no_crash(run)
        for name, expected, call in (("answer_a", "10.50 g", "format_reading(10.5)"), ("answer_b", "2.135 mg", "format_reading(2.13456, \"mg\", 3)"), ("answer_c", "7 g", "format_reading(7, places=0)")):
            got = answer(run, name)
            need(got == expected, f"`{name}` is {got!r}, but `{call}` returns {expected!r}.")

    c.visible("The three predictions are right", predicted, concept="Defaults fill in what a call leaves out")

    def hints(run):
        no_crash(run)
        got = answer(run, "python_checks_hints")
        need(got is False, f"`python_checks_hints` is {got!r}. Python does not enforce type hints: the call starts, and fails only when the format inside the function cannot handle text.")

    c.visible("Type hints are not enforced", hints, concept="Hints are notes for readers and tools")

    def own(run):
        no_crash(run)
        got = run.call("describe", "TEMP02", 22.4)
        need(got == "TEMP02: 22.4 C", f"`describe(\"TEMP02\", 22.4)` returned {got!r}; expected 'TEMP02: 22.4 C'.")
        got = run.call("describe", "TEMP09", 18)
        need(got == "TEMP09: 18 C", f"`describe(\"TEMP09\", 18)` returned {got!r}; expected 'TEMP09: 18 C'. Use the arguments, not fixed text.")
        need(any(isinstance(n, ast.JoinedStr) for n in ast.walk(tree_of(run))), "Write `describe` with an f-string: f\"{sensor_id}: {temperature} C\".")

    c.hidden("describe builds its text with an f-string", own, concept="{name} inside f\"...\" is replaced by the value")


# --------------------------------------------------------------------------- 7R-E

@checks("7R-E")
def _(c):
    def registered(run):
        no_crash(run)
        tools = run.ns["TOOLS"]
        need(sorted(tools) == ["check_temperature", "read_balance"], f"`TOOLS` should hold read_balance and check_temperature; it holds {sorted(tools)}.")
        got = tools["check_temperature"]("TEMP09")
        need(got == {"sensor_id": "TEMP09", "temperature": 22.4, "unit": "C"}, f"`TOOLS[\"check_temperature\"](\"TEMP09\")` returned {got!r}; expected the reading dictionary for TEMP09.")
        need(run.get("names") == ["check_temperature", "read_balance"], f"`names` should be the sorted names in TOOLS; it is {run.get('names')!r}.")
        need(run.get("reading") == "+ 2.1319 g", f"`reading` should be what the read_balance function returns; it is {run.get('reading')!r}.")

    c.visible("Both tools are registered and used through TOOLS", registered)

    def decorated(run):
        no_crash(run)
        functions = [n for n in ast.walk(tree_of(run)) if isinstance(n, ast.FunctionDef) and n.name == "check_temperature"]
        need(functions, "Define `check_temperature(sensor_id)` in your program.")
        need(any(isinstance(d, ast.Name) and d.id == "tool" for d in functions[0].decorator_list), "Put `@tool` on the line above `def check_temperature`. Adding it to TOOLS by hand works, but the exercise is the decorator.")

    c.visible("check_temperature is decorated with @tool", decorated, concept="@tool means: name = tool(function)")

    def through_tools(run):
        no_crash(run)
        tree = tree_of(run)
        subscripts = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, (ast.Subscript, ast.Call))]
        need(subscripts, "Get the function out of TOOLS and call it: `TOOLS[\"read_balance\"]()`.")
        need(any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "sorted" for n in ast.walk(tree)) or ".sort" in run.source, "Build `names` from TOOLS with `sorted(TOOLS)` rather than typing the list.")

    c.hidden("names and reading come from TOOLS", through_tools, concept="A dictionary can hold functions")


# --------------------------------------------------------------------------- 7R-F

@checks("7R-F")
def _(c):
    def default(run):
        no_crash(run)
        need(run.get("names_loop") == ["read_balance", "check_temperature"], f"`names_loop` should equal `names`; it is {run.get('names_loop')!r}.")
        need(run.get("needs") == ["read_balance: {'balance_id': 'XPR205'}", "check_temperature: {'sensor_id': 'TEMP02'}"], f"`needs` should hold one '<name>: <input>' string per tool; it is {run.get('needs')!r}.")
        need(run.get("answer") == "I'll check the instruments.", f"`answer` should be the text of the text block; it is {run.get('answer')!r}.")

    c.visible("The three results are right for the response on the left", default)

    def other(run):
        no_crash(run)
        need(run.get("names_loop") == ["check_temperature"], f"With a different response `names_loop` is {run.get('names_loop')!r}; expected ['check_temperature'].")
        need(run.get("needs") == ["check_temperature: {'sensor_id': 'TEMP09'}"], f"With a different response `needs` is {run.get('needs')!r}.")
        need(run.get("answer") == "First part.\nSecond part.", f"With two text blocks `answer` should join them with a new line; it is {run.get('answer')!r}.")

    c.hidden("A different response gives different results", other, with_response([text("First part."), tool("toolu_9", "check_temperature", {"sensor_id": "TEMP09"}), text("Second part.")]), "Nothing typed in; everything read from the response")

    def loops(run):
        no_crash(run)
        tree = tree_of(run)
        appended = any(
            isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == "append" and isinstance(call.func.value, ast.Name) and call.func.value.id == "names_loop"
            for loop in ast.walk(tree) if isinstance(loop, ast.For)
            for call in ast.walk(loop)
        )
        need(appended, "Build `names_loop` with an ordinary `for` loop that appends to it; that is the point of the first part.")
        need(any(isinstance(n, ast.Attribute) and n.attr == "items" for n in ast.walk(tree)), "Go through `inputs` with `.items()`, which gives each name together with its input.")
        need(any(isinstance(n, ast.Attribute) and n.attr == "join" for n in ast.walk(tree)), "Build `answer` with `\"\\n\".join(...)`.")

    c.hidden("A for loop, .items() and join are used", loops, concept="A comprehension is a loop written on one line")
