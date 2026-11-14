"""Runs a learner's program and reports each call it makes to the Anthropic Messages API.

Usage: python -u lab_trace.py <program.py>

The program runs unchanged, as if started directly. Before it starts, the SDK's
messages.create and messages.stream are wrapped so that every call writes one line to
stderr: a marker followed by JSON. The window that started the program reads those lines
and shows them as the tool-call inspector; they are never shown as program output.

What a line holds: the model, how many messages were sent, the tool names offered, any
tool results in the newest message, and from the reply its stop reason, text, tool calls
and token usage. It never holds the API key or any request header.
"""
import json
import runpy
import sys
import time
import traceback

MARK = "\x1eLABTRACE "
LIMIT = 4000
_count = 0


def _clip(value):
    text = value if isinstance(value, str) else json.dumps(value, default=str, ensure_ascii=False)
    return text if len(text) <= LIMIT else text[:LIMIT] + " [cut]"


def _get(thing, name, default=None):
    if isinstance(thing, dict):
        return thing.get(name, default)
    return getattr(thing, name, default)


def _emit(event):
    try:
        sys.__stderr__.write(MARK + json.dumps(event, default=str, ensure_ascii=False) + "\n")
        sys.__stderr__.flush()
    except Exception:
        pass


def _request(kwargs):
    messages = list(kwargs.get("messages") or [])
    results = []
    if messages:
        content = _get(messages[-1], "content")
        if isinstance(content, (list, tuple)):
            for block in content:
                if _get(block, "type") == "tool_result":
                    results.append({
                        "tool_use_id": _get(block, "tool_use_id"),
                        "content": _clip(_get(block, "content", "")),
                        "is_error": bool(_get(block, "is_error", False)),
                    })
    tools = []
    for tool in kwargs.get("tools") or []:
        tools.append(_get(tool, "name") or _get(tool, "type") or "?")
    return {"model": str(kwargs.get("model", "")), "messages": len(messages), "tools": tools, "results": results}


def _response(message):
    texts, calls = [], []
    for block in _get(message, "content") or []:
        kind = _get(block, "type")
        if kind == "text":
            texts.append(_get(block, "text", ""))
        elif kind in ("tool_use", "server_tool_use"):
            calls.append({"id": _get(block, "id"), "name": _get(block, "name"), "input": _clip(_get(block, "input", {})), "server": kind == "server_tool_use"})
    usage = _get(message, "usage")
    return {
        "stop_reason": _get(message, "stop_reason"),
        "text": _clip("\n".join(texts)),
        "calls": calls,
        "usage": {
            "input": _get(usage, "input_tokens", 0) or 0,
            "output": _get(usage, "output_tokens", 0) or 0,
            "cache_read": _get(usage, "cache_read_input_tokens", 0) or 0,
            "cache_write": _get(usage, "cache_creation_input_tokens", 0) or 0,
        },
        "model": _get(message, "model"),
    }


def _wrap_create(original):
    def create(self, *args, **kwargs):
        global _count
        _count += 1
        event = {"n": _count, "request": _request(kwargs)}
        started = time.time()
        try:
            result = original(self, *args, **kwargs)
        except BaseException as error:
            event["ms"] = int((time.time() - started) * 1000)
            event["error"] = _clip("%s: %s" % (type(error).__name__, error))
            _emit(event)
            raise
        event["ms"] = int((time.time() - started) * 1000)
        if kwargs.get("stream"):
            event["streamed"] = True
        else:
            try:
                event["response"] = _response(result)
            except Exception as error:
                event["note"] = "The reply could not be read: %s" % error
        _emit(event)
        return result

    create._lab_traced = True
    return create


def _wrap_stream(original):
    def stream(self, *args, **kwargs):
        global _count
        _count += 1
        _emit({"n": _count, "request": _request(kwargs), "streamed": True, "ms": 0})
        return original(self, *args, **kwargs)

    stream._lab_traced = True
    return stream


def _install():
    try:
        from anthropic.resources.messages.messages import Messages
    except Exception:
        return
    targets = [Messages]
    try:
        from anthropic.resources.beta.messages.messages import Messages as BetaMessages
        targets.append(BetaMessages)
    except Exception:
        pass
    for cls in targets:
        if "create" in cls.__dict__ and not getattr(cls.create, "_lab_traced", False):
            cls.create = _wrap_create(cls.create)
        if "stream" in cls.__dict__ and not getattr(cls.stream, "_lab_traced", False):
            cls.stream = _wrap_stream(cls.stream)


def main():
    program = sys.argv[1]
    try:
        with open(program, encoding="utf-8") as handle:
            uses_sdk = "anthropic" in handle.read()
    except OSError:
        uses_sdk = False
    if uses_sdk:
        _install()
    sys.argv = [program] + sys.argv[2:]
    try:
        runpy.run_path(program, run_name="__main__")
    except SystemExit:
        raise
    except KeyboardInterrupt:
        raise
    except BaseException as error:
        # Show the traceback the program would have shown on its own: without this file or runpy in it.
        frames = traceback.extract_tb(error.__traceback__)
        own = [f for f in frames if f.filename != __file__ and "runpy" not in f.filename.replace("\\", "/").split("/")[-1]]
        lines = ["Traceback (most recent call last):\n"] + traceback.format_list(own or frames) + traceback.format_exception_only(type(error), error)
        sys.stderr.write("".join(lines))
        sys.exit(1)


if __name__ == "__main__":
    main()
