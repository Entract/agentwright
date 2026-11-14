/**
 * Python-side harness, installed once per Pyodide instance.
 * `__lab_run(payload_json)` runs learner code in a fresh namespace and a fresh
 * working directory, captures output, and runs behaviour tests against it.
 * It returns a JSON string so nothing Python-specific crosses the boundary.
 */
export const HARNESS = String.raw`
import sys, io, os, json, copy, math, shutil, builtins, traceback, linecache, importlib

__LAB_WORK = '/work'
__LAB_MAIN = __LAB_WORK + '/main.py'


class __LabOutput(io.StringIO):
    def __init__(self, limit):
        super().__init__()
        self.limit = limit
        self.count = 0

    def write(self, s):
        self.count += len(s)
        if self.count > self.limit:
            raise RuntimeError(
                'Output limit exceeded (%d characters). Is a loop printing forever?' % self.limit
            )
        return super().write(s)


class __LabLive(io.TextIOBase):
    # Output of an interactive run: handed to the page as it is printed.
    def __init__(self, stream):
        super().__init__()
        self.stream = stream

    def writable(self):
        return True

    def write(self, s):
        if s:
            import lab_host_js
            lab_host_js.write(self.stream, s)
        return len(s)


def __lab_live_input(prompt=''):
    # input() in an interactive run: waits for a line typed into the page.
    import lab_host_js
    if prompt:
        sys.stdout.write(str(prompt))
    try:
        from pyodide.ffi import run_sync
        line = run_sync(lab_host_js.read_line())
    except EOFError:
        raise
    except BaseException as exc:
        if type(exc).__name__ in ('KeyboardInterrupt', 'SystemExit'):
            raise
        raise RuntimeError(
            'input() cannot wait for typing on this device. Update "Android System WebView" (or Chrome) in the Play Store.'
        ) from None
    if line is None:
        raise EOFError('EOF when reading a line')
    return str(line)


def __lab_no_input(prompt=''):
    raise RuntimeError('input() is not available here. Put the value in a variable instead.')


def __lab_reset(files, code):
    for name in list(sys.modules):
        path = getattr(sys.modules[name], '__file__', None) or ''
        if path.startswith(__LAB_WORK + '/'):
            del sys.modules[name]
    os.chdir('/')
    os.makedirs(__LAB_WORK, exist_ok=True)
    for entry in os.listdir(__LAB_WORK):
        path = os.path.join(__LAB_WORK, entry)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        else:
            os.remove(path)
    os.chdir(__LAB_WORK)
    if __LAB_WORK not in sys.path:
        sys.path.insert(0, __LAB_WORK)
    for name, content in files.items():
        path = os.path.join(__LAB_WORK, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(content)
    with open(__LAB_MAIN, 'w', encoding='utf-8') as fh:
        fh.write(code)
    importlib.invalidate_caches()
    linecache.clearcache()


def __lab_error(exc, kind):
    if kind == 'syntax':
        text = ''.join(traceback.format_exception_only(type(exc), exc))
        line = getattr(exc, 'lineno', None)
    else:
        frames = [
            f for f in traceback.extract_tb(exc.__traceback__)
            if f.filename.startswith(__LAB_WORK + '/')
        ]
        text = ''
        if frames:
            text = 'Traceback (most recent call last):\n' + ''.join(traceback.format_list(frames))
        text += ''.join(traceback.format_exception_only(type(exc), exc))
        line = None
        for f in frames:
            if f.filename == __LAB_MAIN:
                line = f.lineno
    text = text.replace(__LAB_WORK + '/', '')
    return {
        'kind': kind,
        'type': type(exc).__name__,
        'message': str(exc),
        'line': line,
        'traceback': text.rstrip(),
    }


def __lab_same(actual, expect):
    if isinstance(expect, bool) or isinstance(actual, bool):
        return isinstance(actual, bool) and isinstance(expect, bool) and actual == expect
    if isinstance(expect, (int, float)) and isinstance(actual, (int, float)):
        return math.isclose(actual, expect, rel_tol=1e-9, abs_tol=1e-9)
    if isinstance(expect, (list, tuple)) and isinstance(actual, (list, tuple)):
        return len(actual) == len(expect) and all(__lab_same(a, e) for a, e in zip(actual, expect))
    if isinstance(expect, dict) and isinstance(actual, dict):
        return actual.keys() == expect.keys() and all(__lab_same(actual[k], expect[k]) for k in expect)
    return actual == expect


def __lab_norm(text):
    return '\n'.join(line.rstrip() for line in text.replace('\r\n', '\n').split('\n')).strip('\n')


def __lab_test(test, ns, stdout, compiled):
    kind = test['kind']
    result = {'name': test['name'], 'passed': False, 'kind': 'logic', 'message': ''}
    if kind == 'call':
        fn = ns.get(test['fn'])
        if not callable(fn):
            result['kind'] = 'misread'
            result['message'] = 'No function named %s is defined.' % test['fn']
            return result
        args = copy.deepcopy(test.get('args', []))
        shown = ', '.join(repr(a) for a in args)
        result['call'] = '%s(%s)' % (test['fn'], shown)
        result['expected'] = repr(test['expect'])
        buf = __LabOutput(20000)
        old = sys.stdout
        sys.stdout = buf
        try:
            actual = fn(*args)
        except BaseException as exc:
            sys.stdout = old
            result['kind'] = 'runtime'
            result['message'] = __lab_error(exc, 'runtime')['traceback']
            return result
        finally:
            sys.stdout = old
        result['actual'] = repr(actual)
        if __lab_same(actual, test['expect']):
            result['passed'] = True
            result['kind'] = 'pass'
        elif actual is None and buf.getvalue().strip():
            result['message'] = (
                'The function printed a value but returned None. '
                'print only displays a value; return sends it back to the caller.'
            )
        elif actual is None:
            result['message'] = 'The function returned None. Does every path reach a return?'
        return result
    if kind == 'stdout':
        result['expected'] = __lab_norm(test['expect'])
        result['actual'] = __lab_norm(stdout)
        if result['actual'] == result['expected']:
            result['passed'] = True
            result['kind'] = 'pass'
        elif not result['actual']:
            result['message'] = 'Nothing was printed.'
        return result
    if kind == 'python':
        scope = dict(ns)
        scope['_stdout'] = stdout
        buf = __LabOutput(20000)
        old = sys.stdout
        sys.stdout = buf
        try:
            exec(test['code'], scope)
            result['passed'] = True
            result['kind'] = 'pass'
        except AssertionError as exc:
            result['message'] = str(exc) or 'A check failed.'
        except NameError as exc:
            result['kind'] = 'misread'
            result['message'] = str(exc)
        except BaseException as exc:
            result['kind'] = 'runtime'
            result['message'] = ''.join(traceback.format_exception_only(type(exc), exc)).strip()
        finally:
            sys.stdout = old
        return result
    if kind == 'vars':
        given = test.get('given') or {}
        result['call'] = 'with ' + ', '.join('%s = %r' % (k, v) for k, v in given.items())
        scope = {'__name__': '__main__'}
        scope.update(copy.deepcopy(given))
        buf = __LabOutput(20000)
        old = sys.stdout
        sys.stdout = buf
        try:
            exec(compiled, scope)
        except BaseException as exc:
            sys.stdout = old
            result['kind'] = 'runtime'
            result['message'] = __lab_error(exc, 'runtime')['traceback']
            return result
        finally:
            sys.stdout = old
        problems = []
        for name, value in given.items():
            if not __lab_same(scope.get(name), value):
                problems.append('%s is already defined for you; the code should not assign it.' % name)
        want_vars = test.get('expectVars') or {}
        for name, value in want_vars.items():
            if name not in scope:
                result['kind'] = 'misread'
                problems.append('No variable named %s was set.' % name)
            elif not __lab_same(scope[name], value):
                problems.append('%s is %r, expected %r.' % (name, scope[name], value))
        if 'expectStdout' in test:
            result['expected'] = __lab_norm(test['expectStdout'])
            result['actual'] = __lab_norm(buf.getvalue())
            if not result['actual']:
                problems.append('Nothing was printed.')
            elif result['actual'] != result['expected']:
                problems.append('The printed output is different.')
        if problems:
            result['message'] = ' '.join(problems)
        else:
            result['passed'] = True
            result['kind'] = 'pass'
        return result
    result['message'] = 'Unknown test kind: %s' % kind
    return result


def __lab_net_setup():
    # Called once the bundled packages are loaded. Browsers only let a page call
    # the Anthropic API when this header is present, and the Python library does
    # not send it by itself. Only requests to api.anthropic.com are touched.
    import warnings
    import httpx2  # first: httpx2_jsfetch cannot be imported before it
    import httpx2_jsfetch
    if getattr(httpx2_jsfetch, '_lab_patched', False):
        return
    original = httpx2_jsfetch._do_fetch

    def _do_fetch(request, request_body, abort_controller_js):
        if request.url.host == 'api.anthropic.com':
            request.headers['anthropic-dangerous-direct-browser-access'] = 'true'
        return original(request, request_body, abort_controller_js)

    httpx2_jsfetch._do_fetch = _do_fetch
    httpx2_jsfetch._lab_patched = True
    # The library asks for socket options that mean nothing in a browser.
    warnings.filterwarnings('ignore', message='The following transport option')


def __lab_run(payload):
    request = json.loads(payload)
    env = request.get('env') or {}
    before = {name: os.environ.get(name) for name in env}
    os.environ.update(env)
    try:
        return __lab_run_request(request)
    finally:
        for name, value in before.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def __lab_run_request(request):
    code = request['code']
    result = {'stdout': '', 'error': None, 'tests': []}
    __lab_reset(request.get('files') or {}, code)
    try:
        compiled = compile(code, __LAB_MAIN, 'exec')
    except SyntaxError as exc:
        result['error'] = __lab_error(exc, 'syntax')
        return json.dumps(result)
    live = bool(request.get('interactive'))
    out = __LabLive('out') if live else __LabOutput(int(request.get('maxOutput') or 20000))
    ns = {'__name__': '__main__'}
    ns.update(copy.deepcopy(request.get('given') or {}))
    saved = (sys.stdout, sys.stderr, builtins.input)
    sys.stdout = out
    sys.stderr = __LabLive('err') if live else out
    builtins.input = __lab_live_input if live else __lab_no_input
    try:
        try:
            exec(compiled, ns)
        except SystemExit:
            pass
        except BaseException as exc:
            result['error'] = __lab_error(exc, 'runtime')
        result['stdout'] = '' if live else out.getvalue()
        if result['error'] is None:
            for test in request.get('tests') or []:
                result['tests'].append(__lab_test(test, ns, result['stdout'], compiled))
    finally:
        sys.stdout, sys.stderr, builtins.input = saved
    return json.dumps(result)
`
