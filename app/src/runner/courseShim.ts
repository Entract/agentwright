/**
 * Runs the guided course's own checker (desktop/curriculum/labcheck.py and its checks) inside
 * the app's Python, so the phone uses exactly the tests the PC uses.
 *
 * `__course_install(files_json)` writes the curriculum files once per Python instance.
 * `__course(payload_json)` runs one command and returns a JSON string:
 *   check    -> {"report": {...}}
 *   run      -> {"output": "...", "stopped": bool}
 *   solution -> {"text": "..."}
 *   info     -> {"info": {...}}
 * A failure of the engine itself comes back as {"problem": "..."}.
 */
export const COURSE_SHIM = String.raw`
import sys as __cs_sys, os as __cs_os, json as __cs_json, io as __cs_io, shutil as __cs_shutil
import builtins as __cs_builtins, contextlib as __cs_contextlib, importlib as __cs_importlib

__COURSE_DIR = '/curriculum'
__COURSE_WORK = '/coursework'
# A phone is slower than a PC, and the first import of a large library can take seconds.
__COURSE_CASE_LIMIT = 12.0
__COURSE_RUN_LIMIT = 20.0


def __course_install(files_json):
    files = __cs_json.loads(files_json)
    __cs_os.makedirs(__COURSE_DIR, exist_ok=True)
    for name, text in files.items():
        with open(__cs_os.path.join(__COURSE_DIR, name), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text)
    if __COURSE_DIR not in __cs_sys.path:
        __cs_sys.path.insert(0, __COURSE_DIR)
    __cs_importlib.invalidate_caches()
    # Imported now so that the slow first import is never counted against a test case.
    import anthropic, anthropic.types  # noqa: F401
    import labcheck
    labcheck.CASE_TIME_LIMIT = __COURSE_CASE_LIMIT
    labcheck._load_checks()
    return 'ok'


def __course_workspace(exercise_id, files, explanation):
    folder = __cs_os.path.join(__COURSE_WORK, exercise_id)
    __cs_shutil.rmtree(folder, ignore_errors=True)
    __cs_os.makedirs(folder)
    for name, text in files.items():
        if __cs_os.path.basename(name) != name or not name.endswith(('.py', '.json', '.txt')):
            raise ValueError('Unsupported file name: ' + name)
        with open(__cs_os.path.join(folder, name), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text)
    with open(__cs_os.path.join(folder, 'explanation.txt'), 'w', encoding='utf-8') as fh:
        fh.write(explanation)
    return folder


def __course_leave(folder):
    while folder in __cs_sys.path:
        __cs_sys.path.remove(folder)
    __cs_os.chdir(__COURSE_DIR)


def __course_check(labcheck, p):
    folder = __course_workspace(p['exerciseId'], p['files'], p.get('explanation', ''))
    __cs_os.chdir(__COURSE_DIR)
    try:
        files, explanation = labcheck.read_workspace(folder, p['exerciseId'])
        return {'report': labcheck.check_exercise(p['exerciseId'], files, explanation, folder)}
    finally:
        __course_leave(folder)


def __course_run(labcheck, p):
    exercise_id = p['exerciseId']
    exercise = labcheck.EXERCISES[exercise_id]
    folder = __course_workspace(exercise_id, p['files'], p.get('explanation', ''))
    files, _ = labcheck.read_workspace(folder, exercise_id)
    entry = labcheck.OPTIONS.get(exercise_id, {}).get('entry', labcheck.MAIN)
    names = set(files) | {__cs_os.path.join(folder, name) for name in files}
    typed = list(p.get('input') or [])
    out = labcheck._Output()
    stopped = False

    def say(text):
        # Notes from the app are always shown, even when the program has filled the output.
        __cs_io.StringIO.write(out, text)

    def typed_input(prompt=''):
        out.write(str(prompt))
        if not typed:
            say('\n[No more typed lines, so the run ends here.]\n')
            raise SystemExit(0)
        line = typed.pop(0)
        out.write(line + '\n')
        return line

    for name, source in files.items():
        labcheck._register_source(name, source)
    saved_input = __cs_builtins.input
    __cs_os.environ.pop('LAB_AGENT_LIVE', None)
    labcheck._purge(folder, files)
    __cs_os.chdir(folder)
    try:
        namespace = labcheck.build_namespace(exercise)
        namespace['__file__'] = __cs_os.path.join(folder, entry)
        code = compile(files.get(entry, ''), entry, 'exec')
        __cs_builtins.input = typed_input
        with __cs_contextlib.redirect_stdout(out), __cs_contextlib.redirect_stderr(out), labcheck.offline(), labcheck.watched(labcheck.Run(), names, __COURSE_RUN_LIMIT):
            exec(code, namespace)
    except labcheck.TimeLimit:
        stopped = True
        say('\n[Stopped after %d seconds. Is there a loop that never ends?]\n' % __COURSE_RUN_LIMIT)
    except SystemExit:
        pass
    except BaseException as exc:  # noqa: BLE001 - learner code may raise anything
        say(labcheck._describe_error(exc, names)['traceback'] + '\n')
    finally:
        __cs_builtins.input = saved_input
        labcheck._purge(folder, files)
        while labcheck.CLEANUPS:
            labcheck.CLEANUPS.pop()()
        __course_leave(folder)
    return {'output': out.getvalue(), 'stopped': stopped}


def __course_printed(fn, *args):
    out = __cs_io.StringIO()
    with __cs_contextlib.redirect_stdout(out):
        code = fn(*args)
    return code, out.getvalue()


def __course(payload_json):
    try:
        import labcheck
        p = __cs_json.loads(payload_json)
        command = p['command']
        if command == 'info':
            _, text = __course_printed(labcheck.command_info)
            return __cs_json.dumps({'info': __cs_json.loads(text)})
        if p.get('exerciseId') not in labcheck.EXERCISES:
            return __cs_json.dumps({'problem': 'Unknown exercise.'})
        if command == 'solution':
            code, text = __course_printed(labcheck.command_solution, p['exerciseId'])
            return __cs_json.dumps({'text': text.rstrip()} if code == 0 else {'problem': text.strip()})
        if command == 'check':
            return __cs_json.dumps(__course_check(labcheck, p))
        if command == 'run':
            return __cs_json.dumps(__course_run(labcheck, p))
        return __cs_json.dumps({'problem': 'Unknown command.'})
    except BaseException as exc:  # noqa: BLE001
        return __cs_json.dumps({'problem': '%s: %s' % (type(exc).__name__, exc)})
`
