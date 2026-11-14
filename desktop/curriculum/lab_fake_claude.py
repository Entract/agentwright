"""A simulated Claude for the LAB-AGENT project. Nothing here uses the network or a key.

Use it exactly as you would use the real client:

    import fake_claude
    client = fake_claude.FakeClient()
    response = client.messages.create(model="claude-opus-5-5", max_tokens=1024, messages=messages, tools=tools)

The response is a real SDK Message object, so response.content, block.type, block.name,
block.input, block.id and response.stop_reason all work as they do with the real API.

What this simulation decides (the real Claude decides far more cleverly, from your descriptions):
  - asked to weigh something, and a read_balance tool was offered -> it requests read_balance
  - asked for the temperature, and a check_temperature tool was offered -> it requests that
  - asked to do something "twice" -> it asks again after seeing the first result
  - sent tool results -> it answers in words, quoting the results
  - sent a failed result (is_error) -> it reports the failure and does not try again
  - asked "who are you?" or about its instructions -> it quotes the start of the system prompt
  - anything else -> a short text answer

Like the real API, it refuses a request whose messages are not in a valid order.
You do not need to read the rest of this file to do the milestones.
"""
import re

from anthropic.types import Message


class BadRequestError(Exception):
    """The simulated version of the API's "400 invalid request" error."""


WEIGH_WORDS = ("weigh", "mass", "balance", "reading", "heavy")
TEMPERATURE_WORDS = ("temperature", "temp ", "warm", "cold", "degrees")


def _field(block, name):
    """Reads a field from a content block, whether it is a dictionary or an SDK object."""
    if isinstance(block, dict):
        return block.get(name)
    return getattr(block, name, None)


def _blocks(content):
    """The content of a message as a list of blocks (a plain string counts as one text block)."""
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, (list, tuple)):
        return list(content)
    raise BadRequestError("messages: content must be a string or a list of content blocks, not " + type(content).__name__)


def _text_of(content):
    return " ".join(str(_field(b, "text") or "") for b in _blocks(content) if _field(b, "type") == "text")


def _result_text(block):
    content = _field(block, "content")
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, (list, tuple)):
        return " ".join(str(_field(b, "text") or "") for b in content)
    raise BadRequestError(
        "messages: tool_result content must be a string or a list of content blocks, not " + type(content).__name__
        + ". Turn the tool's result into text first (for a dictionary, json.dumps)."
    )


def check_messages(messages):
    """Refuses histories the real API would refuse, with a message that says what is wrong."""
    if not isinstance(messages, (list, tuple)):
        raise BadRequestError("messages: must be a list of messages, not " + type(messages).__name__)
    if len(messages) == 0:
        raise BadRequestError("messages: at least one message is required")
    expected = "user"
    pending = []  # ids of tool_use blocks in the previous assistant message
    for index, message in enumerate(messages):
        if not isinstance(message, dict) or "role" not in message or "content" not in message:
            raise BadRequestError(f"messages.{index}: each message must be a dictionary with \"role\" and \"content\"")
        role = message["role"]
        if role not in ("user", "assistant"):
            raise BadRequestError(f"messages.{index}: role must be \"user\" or \"assistant\", not {role!r}")
        if index == 0 and role != "user":
            raise BadRequestError("messages: the first message must have the role \"user\"")
        if role != expected:
            raise BadRequestError(f"messages.{index}: expected a message with the role \"{expected}\" here, but found \"{role}\". Roles must alternate.")
        blocks = _blocks(message["content"])
        if role == "user":
            answered = [_field(b, "tool_use_id") for b in blocks if _field(b, "type") == "tool_result"]
            missing = [i for i in pending if i not in answered]
            if missing:
                raise BadRequestError(
                    f"messages.{index}: tool_use ids were found without tool_result blocks immediately after: "
                    + ", ".join(missing) + ". Each tool_use block must have a corresponding tool_result block in the next message."
                )
            stray = [i for i in answered if i not in pending]
            if stray:
                raise BadRequestError(
                    f"messages.{index}: unexpected tool_use_id found in tool_result blocks: " + ", ".join(str(i) for i in stray)
                    + ". Each tool_result block must have a corresponding tool_use block in the previous message."
                )
            for block in blocks:
                if _field(block, "type") == "tool_result":
                    _result_text(block)
            pending = []
            expected = "assistant"
        else:
            pending = [_field(b, "id") for b in blocks if _field(b, "type") == "tool_use"]
            expected = "user"
    if messages[-1]["role"] != "user":
        raise BadRequestError("messages: the last message must have the role \"user\" (a question, or tool results)")


def check_tools(tools):
    if tools is None:
        return []
    if not isinstance(tools, (list, tuple)):
        raise BadRequestError("tools: must be a list of tool definitions, not " + type(tools).__name__)
    for index, tool in enumerate(tools):
        if not isinstance(tool, dict):
            raise BadRequestError(f"tools.{index}: each tool must be a dictionary")
        for key in ("name", "input_schema"):
            if key not in tool:
                raise BadRequestError(f"tools.{index}.{key}: Field required")
        schema = tool["input_schema"]
        if not isinstance(schema, dict) or schema.get("type") != "object":
            raise BadRequestError(f"tools.{index}.input_schema.type: must be \"object\"")
    return [tool["name"] for tool in tools]


class Messages:
    """The part of the client that makes requests: client.messages.create(...)."""

    def __init__(self, client):
        self._client = client

    def create(self, *, model=None, max_tokens=None, messages=None, tools=None, system=None, **other):
        if model is None or max_tokens is None or messages is None:
            missing = [name for name, value in (("max_tokens", max_tokens), ("messages", messages), ("model", model)) if value is None]
            raise TypeError("Missing required arguments; create() needs model, max_tokens and messages. Missing: " + ", ".join(missing))
        if not isinstance(model, str) or not model:
            raise BadRequestError("model: must be the name of a model, for example \"claude-opus-5-5\"")
        if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or max_tokens < 1:
            raise BadRequestError("max_tokens: must be a whole number of at least 1")
        check_messages(messages)
        names = check_tools(tools)
        self._client.requests += 1
        blocks, stop_reason = decide(messages, names, system)
        content = []
        for block in blocks:
            if block["type"] == "tool_use":
                self._client.tool_requests += 1
                block = dict(block, id=f"toolu_sim_{self._client.tool_requests:02d}")
            content.append(block)
        return Message.model_validate({
            "id": f"msg_sim_{self._client.requests:02d}",
            "type": "message",
            "role": "assistant",
            "model": model,
            "content": content,
            "stop_reason": stop_reason,
            "stop_sequence": None,
            "usage": {"input_tokens": 0, "output_tokens": 0},
        })


class FakeClient:
    """Stands in for anthropic.Anthropic(). It needs no key."""

    def __init__(self, **options):
        self.requests = 0
        self.tool_requests = 0
        self.messages = Messages(self)


# ---------------------------------------------------------------- what the simulation "decides"

def _say(text):
    return [{"type": "text", "text": text}], "end_turn"


def _ask(text, requests):
    blocks = [{"type": "text", "text": text}]
    for name, tool_input in requests:
        blocks.append({"type": "tool_use", "name": name, "input": tool_input})
    return blocks, "tool_use"


def _current_turn(messages):
    """The latest question in plain words, and the tool results gathered since it was asked."""
    results = []
    for message in reversed(messages):
        if message["role"] != "user":
            continue
        blocks = _blocks(message["content"])
        found = [b for b in blocks if _field(b, "type") == "tool_result"]
        words = _text_of(message["content"]).strip()
        if found and not words:
            results = found + results
            continue
        return words, found + results
    return "", results


def _requested_names(messages):
    """tool_use id -> tool name, for every request in the history."""
    names = {}
    for message in messages:
        if message["role"] == "assistant":
            for block in _blocks(message["content"]):
                if _field(block, "type") == "tool_use":
                    names[_field(block, "id")] = _field(block, "name")
    return names


def _wanted(question, tool_names):
    """The tool requests this question calls for, as (name, input) pairs."""
    lowered = " " + question.lower() + " "
    wanted = []
    if "read_balance" in tool_names and any(word in lowered for word in WEIGH_WORDS):
        wanted.append(("read_balance", {}))
    if "check_temperature" in tool_names and any(word in lowered for word in TEMPERATURE_WORDS):
        sensor = re.search(r"\b(TEMP\d+)\b", question, re.IGNORECASE)
        wanted.append(("check_temperature", {"sensor_id": sensor.group(1).upper() if sensor else "TEMP01"}))
    return wanted


def decide(messages, tool_names, system):
    question, results = _current_turn(messages)
    lowered = " " + question.lower() + " "
    wanted = _wanted(question, tool_names)
    rounds = 2 if any(word in lowered for word in (" twice", " two ", " 2 ", " again and again")) else 1

    if results:
        names = _requested_names(messages)
        done = {}
        for block in results:
            name = names.get(_field(block, "tool_use_id"), "tool")
            done.setdefault(name, []).append(block)
        again = [(name, tool_input) for name, tool_input in wanted if len(done.get(name, [])) < rounds]
        if again and not any(_field(b, "is_error") for b in results):
            return _ask("I'll take another reading.", again)
        parts = []
        for name, blocks in done.items():
            failed = [b for b in blocks if _field(b, "is_error")]
            good = [b for b in blocks if not _field(b, "is_error")]
            label = {"read_balance": "The balance reads", "check_temperature": "The temperature sensor reports"}.get(name, f"The tool {name} returned")
            if good:
                parts.append(label + " " + " and then ".join(_result_text(b) for b in good) + ".")
            if failed:
                parts.append(f"The tool {name} failed: " + "; ".join(_result_text(b) for b in failed) + ". I did not try it again.")
        return _say(" ".join(parts))

    if wanted:
        return _ask("I'll check that for you.", wanted)

    if "who are you" in lowered or "your instructions" in lowered or "your rules" in lowered:
        if not system:
            return _say("I was given no instructions for this conversation, only your messages and the tools.")
        instructions = system if isinstance(system, str) else _text_of(system)
        first = re.split(r"(?<=[.!?])\s", instructions.strip(), maxsplit=1)[0]
        return _say(f"My instructions begin: \"{first}\"")
    if any(word in lowered for word in WEIGH_WORDS) and "read_balance" not in tool_names:
        return _say("I can't read the balance: no tool for that was offered to me in this request.")
    if "first" in lowered and ("ask" in lowered or "question" in lowered or "said" in lowered):
        asked = [_text_of(m["content"]).strip() for m in messages if m["role"] == "user" and _text_of(m["content"]).strip()]
        if len(asked) <= 1:
            return _say("This is the first thing you have asked me. I only know what is in the messages you send.")
        return _say(f"The first thing you asked was: \"{asked[0]}\".")
    if any(word in lowered for word in (" hello", " hi ", " hey")):
        return _say("Hello. I can read the lab balance if you ask me to weigh something.")
    return _say(f"You asked: \"{question}\". I have no tool for that, so I can only answer in words.")
