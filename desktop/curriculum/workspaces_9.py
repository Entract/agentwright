"""Starter workspaces for the three timed projects (module 9).

Original practice projects written for this course from the curriculum's contracts. They are
Each is a small multi-file program that runs offline
against a scripted fake client.
"""

RUBRIC = (
    " Mentor rubric (100 points): correct and safe working changes 40; diagnosis and execution tracing 25; "
    "meaningful tests and edge cases 20; explanation and prioritisation 15."
)

# --------------------------------------------------------------------------- 9A

TOOLS_9A = '''"""Simulated instruments. Nothing here touches real hardware."""


def read_balance(balance_id):
    return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}


def check_temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}


def execute_tool(name, args):
    """Runs one allowlisted tool and returns its result dictionary."""
    if name == "read_balance":
        return read_balance(args["balance_id"])
    if name == "check_temperature":
        return check_temperature(args["sensor_id"])
    return {"error": "unknown tool: " + name}
'''

FAKE_CLIENT_9A = '''"""A scripted stand-in for the Claude API. It never uses the network."""
from anthropic.types import Message


def message(content, stop_reason):
    """Builds a real SDK Message locally from a list of content-block dictionaries."""
    return Message.model_validate({
        "id": "msg_fake", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
        "content": content, "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    })


def one_tool_request():
    return message([
        {"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {"balance_id": "XPR205"}},
    ], "tool_use")


def two_tool_request():
    return message([
        {"type": "text", "text": "I'll check both instruments."},
        {"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {"balance_id": "XPR205"}},
        {"type": "tool_use", "id": "toolu_2", "name": "check_temperature", "input": {"sensor_id": "TEMP02"}},
    ], "tool_use")


def final_answer():
    return message([{"type": "text", "text": "The balance reads 10.52 g and the room is at 22.4 C."}], "end_turn")


def two_part_final_answer():
    return message([
        {"type": "text", "text": "The balance reads 10.52 g."},
        {"type": "text", "text": "The room is at 22.4 C."},
    ], "end_turn")


class FakeClient:
    """Returns the scripted responses in order and remembers every history it was sent."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, messages):
        # Keep a copy of the history exactly as it was at the moment of this call.
        snapshot = []
        for m in messages:
            content = m["content"]
            snapshot.append({"role": m["role"], "content": list(content) if isinstance(content, list) else content})
        self.calls.append(snapshot)
        index = min(len(self.calls), len(self.responses)) - 1
        return self.responses[index]
'''

AGENT_9A = '''"""The balance assistant: asks the (fake) model, runs the tools it requests, returns its final answer."""
import json

from tools import execute_tool

MAX_ROUNDS = 5


def run_agent(client, user_text):
    messages = [{"role": "user", "content": user_text}]
    response = client.create(messages)
    rounds = 0
    while response.stop_reason == "tool_use" and rounds < MAX_ROUNDS:
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                if not tool_results:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
                messages.append({"role": "user", "content": tool_results})
                response = client.create(messages)
        rounds += 1
    return response.content[-1].text
'''

TEST_RUNNER = '''

if __name__ == "__main__":
    failed = 0
    for name, test in sorted(globals().items()):
        if name.startswith("test_") and callable(test):
            try:
                test()
                print("PASS ", name)
            except AssertionError as exc:
                failed += 1
                print("FAIL ", name, "-", exc if str(exc) else "an assert was false")
            except Exception as exc:
                failed += 1
                print("ERROR", name, "-", type(exc).__name__ + ":", exc)
    print(failed, "failed")
'''

TEST_AGENT_9A = '''"""Tests for the balance assistant. Run this file to see which pass."""
from agent import run_agent
from fake_client import FakeClient, final_answer, one_tool_request, two_part_final_answer, two_tool_request


def result_ids(message):
    return [block["tool_use_id"] for block in message["content"]]


def test_single_tool_request():
    client = FakeClient([one_tool_request(), final_answer()])
    text = run_agent(client, "What does the balance read?")
    assert len(client.calls) == 2, f"expected 2 API calls, got {len(client.calls)}"
    assert result_ids(client.calls[1][-1]) == ["toolu_1"]
    assert "10.52" in text


def test_two_tools_in_one_turn():
    client = FakeClient([two_tool_request(), final_answer()])
    run_agent(client, "Read the balance and the temperature.")
    assert len(client.calls) == 2, f"expected 2 API calls, got {len(client.calls)}"
    assert result_ids(client.calls[1][-1]) == ["toolu_1", "toolu_2"]


def test_final_answer_in_two_text_blocks():
    client = FakeClient([two_part_final_answer()])
    text = run_agent(client, "Summarise the readings.")
    assert "10.52" in text and "22.4" in text, f"got {text!r}"


# Add your regression test(s) below. Any function named test_... is run automatically.
''' + TEST_RUNNER

NOTE_9A = (
    "In this app: the project is in the file tabs above the editor. Run executes `test_agent.py`, which prints PASS or FAIL for each test; two fail at the start. "
    "Find the three causes in `agent.py`, fix them without rewriting the agent, and add at least one regression test of your own to `test_agent.py`. "
    "In the explanation box, describe the correct sequence of events for a turn with two tool requests. Give yourself 55 minutes. No live API is involved." + RUBRIC
)

WORKSPACE_9A = {"agent.py": AGENT_9A, "tools.py": TOOLS_9A, "fake_client.py": FAKE_CLIENT_9A, "test_agent.py": TEST_AGENT_9A}

# --------------------------------------------------------------------------- 9B

TOOLS_9B = '''"""Simulated instruments and the dispatcher. Nothing here touches real hardware."""


def read_balance(balance_id):
    return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}


def check_temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}


def execute_tool(name, args):
    """Runs one allowlisted tool. Problems are returned as {"error": ...}; nothing is raised."""
    if name == "read_balance":
        balance_id = args.get("balance_id")
        if not isinstance(balance_id, str) or not balance_id:
            return {"error": "balance_id must be a non-empty string"}
        return read_balance(balance_id)
    if name == "check_temperature":
        sensor_id = args.get("sensor_id")
        if not isinstance(sensor_id, str) or not sensor_id:
            return {"error": "sensor_id must be a non-empty string"}
        return check_temperature(sensor_id)
    return {"error": "unknown tool: " + name}
'''

SCHEMAS_9B = '''"""Tool definitions sent to the model: what each tool is for and which arguments it takes."""

TOOLS = [
    {
        "name": "read_balance",
        "description": "Read the current mass from a simulated balance.",
        "input_schema": {
            "type": "object",
            "properties": {"balance_id": {"type": "string"}},
            "required": ["balance_id"],
        },
    },
    {
        "name": "check_temperature",
        "description": "Read the temperature from a simulated sensor.",
        "input_schema": {
            "type": "object",
            "properties": {"sensor_id": {"type": "string"}},
            "required": ["sensor_id"],
        },
    },
]
'''

AGENT_9B = '''"""A working two-tool lab agent. Extend it; do not break it."""
import json

from schemas import TOOLS
from tools import execute_tool

MAX_ROUNDS = 5


def run_agent(client, user_text):
    messages = [{"role": "user", "content": user_text}]
    response = client.create(messages, TOOLS)
    rounds = 0
    while response.stop_reason == "tool_use" and rounds < MAX_ROUNDS:
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                entry = {"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}
                if "error" in result:
                    entry["is_error"] = True
                tool_results.append(entry)
        messages.append({"role": "user", "content": tool_results})
        response = client.create(messages, TOOLS)
        rounds += 1
    return "\\n".join(block.text for block in response.content if block.type == "text")
'''

TEST_AGENT_9B = '''"""Tests for the lab agent. Run this file to see which pass."""
import json

from anthropic.types import Message

from agent import run_agent
from tools import execute_tool


def message(content, stop_reason):
    return Message.model_validate({
        "id": "msg_fake", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
        "content": content, "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    })


class FakeClient:
    """Returns scripted responses in order; remembers the history and tools it was sent."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, messages, tools):
        self.calls.append({"messages": [dict(m) for m in messages], "tools": list(tools)})
        return self.responses[min(len(self.calls), len(self.responses)) - 1]


def test_read_balance():
    assert execute_tool("read_balance", {"balance_id": "XPR205"}) == {"balance_id": "XPR205", "mass": 10.52, "unit": "g"}


def test_unknown_tool_is_an_error():
    assert "error" in execute_tool("open_door", {})


def test_agent_returns_a_matching_tool_result():
    request = message([{"type": "tool_use", "id": "toolu_1", "name": "check_temperature", "input": {"sensor_id": "TEMP02"}}], "tool_use")
    final = message([{"type": "text", "text": "It is 22.4 C."}], "end_turn")
    client = FakeClient([request, final])
    assert run_agent(client, "How warm is it?") == "It is 22.4 C."
    result = client.calls[1]["messages"][-1]["content"][0]
    assert result["tool_use_id"] == "toolu_1"
    assert json.loads(result["content"])["temperature"] == 22.4


# Add tests for check_stability below. Any function named test_... is run automatically.
''' + TEST_RUNNER

NOTE_9B = (
    "In this app: the project is in the file tabs above the editor. Add a tool `check_stability` to this working agent. It takes `masses`, a list of at least three numbers, "
    "and returns `{\"stable\": True or False, \"range\": max - min}`, where stable means the range is at most 0.02 g. Missing, too short or non-numeric `masses` give "
    "`{\"error\": ...}`. Add its definition to `schemas.py`, its allowlisted branch to `execute_tool` in `tools.py`, and tests to `test_agent.py`. "
    "The two existing tools must keep working. In the explanation box, note the trade-offs you made. Give yourself 55 minutes." + RUBRIC
)

WORKSPACE_9B = {"agent.py": AGENT_9B, "tools.py": TOOLS_9B, "schemas.py": SCHEMAS_9B, "test_agent.py": TEST_AGENT_9B}

# --------------------------------------------------------------------------- 9C

AGENT_9C = '''"""A lab agent with several reliability problems. Measure it first, then improve it."""
import json

# Every tare that was actually carried out. A tare changes the instrument, so it matters.
TARE_LOG = []


def read_balance(balance_id):
    if balance_id == "FLAKY01":
        raise RuntimeError("simulated sensor timeout")
    return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}


def check_temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}


def tare_balance(balance_id):
    TARE_LOG.append(balance_id)
    return {"balance_id": balance_id, "tared": True}


def execute_tool(name, args):
    if name == "read_balance":
        return read_balance(args["balance_id"])
    if name == "check_temperature":
        return check_temperature(args["sensor_id"])
    if name == "tare_balance":
        return tare_balance(args["balance_id"])
    raise KeyError(name)


def run_agent(client, user_text):
    """Returns {"final_text": ..., "messages": ..., "status": ...}."""
    messages = [{"role": "user", "content": user_text}]
    response = client.create(messages)
    while response.stop_reason == "tool_use":
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
        messages.append({"role": "user", "content": tool_results})
        response = client.create(messages)
    final_text = "\\n".join(block.text for block in response.content if block.type == "text")
    return {"final_text": final_text, "messages": messages, "status": "completed"}
'''

EVAL_CASES_9C = '''[
  {"id": 1, "name": "single valid balance", "user": "What does the balance read?",
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {"balance_id": "XPR205"}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "The balance reads 10.52 g."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": false}], "status": "completed", "final_text_contains": "10.52", "max_api_calls": 2}},

  {"id": 2, "name": "single valid temperature", "user": "How warm is the room?",
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "check_temperature", "input": {"sensor_id": "TEMP02"}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "It is 22.4 C."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": false}], "status": "completed", "final_text_contains": "22.4", "max_api_calls": 2}},

  {"id": 3, "name": "parallel two tools", "user": "Read the balance and the temperature.",
   "responses": [
     {"stop_reason": "tool_use", "content": [
       {"type": "text", "text": "Checking both."},
       {"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {"balance_id": "XPR205"}},
       {"type": "tool_use", "id": "toolu_2", "name": "check_temperature", "input": {"sensor_id": "TEMP02"}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "10.52 g at 22.4 C."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": false}, {"id": "toolu_2", "is_error": false}], "status": "completed", "max_api_calls": 2}},

  {"id": 4, "name": "text-only end_turn", "user": "Hello.",
   "responses": [{"stop_reason": "end_turn", "content": [{"type": "text", "text": "Hello. Which instrument should I read?"}]}],
   "expect": {"results": [], "status": "completed", "final_text_contains": "Hello", "max_api_calls": 1}},

  {"id": 5, "name": "unknown tool", "user": "Open the fume hood.",
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "open_fume_hood", "input": {}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "I cannot open the fume hood."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": true}], "status": "completed", "max_api_calls": 2}},

  {"id": 6, "name": "missing required argument", "user": "Read the balance.",
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "Which balance do you mean?"}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": true}], "status": "completed", "max_api_calls": 2}},

  {"id": 7, "name": "wrong argument type", "user": "Read balance 42.",
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {"balance_id": 42}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "That is not a valid balance."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": true}], "status": "completed", "max_api_calls": 2}},

  {"id": 8, "name": "transient instrument failure", "user": "Read the old balance and the temperature.",
   "responses": [
     {"stop_reason": "tool_use", "content": [
       {"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {"balance_id": "FLAKY01"}},
       {"type": "tool_use", "id": "toolu_2", "name": "check_temperature", "input": {"sensor_id": "TEMP02"}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "The balance timed out; the room is at 22.4 C."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": true}, {"id": "toolu_2", "is_error": false}], "status": "completed", "max_api_calls": 2}},

  {"id": 9, "name": "unconfirmed tare request", "user": "Weigh the sample.",
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_1", "name": "tare_balance", "input": {"balance_id": "XPR205"}}]},
     {"stop_reason": "end_turn", "content": [{"type": "text", "text": "I need your confirmation before taring."}]}],
   "expect": {"results": [{"id": "toolu_1", "is_error": true}], "tare_executed": false, "status": "completed", "max_api_calls": 2}},

  {"id": 10, "name": "max tool rounds reached", "user": "Keep reading the balance.", "repeat_forever": true,
   "responses": [
     {"stop_reason": "tool_use", "content": [{"type": "tool_use", "id": "toolu_loop", "name": "read_balance", "input": {"balance_id": "XPR205"}}]}],
   "expect": {"status": "max_rounds_reached", "max_api_calls": 6}}
]
'''

EVALUATE_9C = '''"""Runs the agent against the ten scenarios in eval_cases.json and prints a scorecard."""
import json
import os

from anthropic.types import Message

# A model that never stops asking for tools is cut off here so the baseline run still ends.
RUNAWAY_CUTOFF = 30


def build_message(spec, call_number):
    content = []
    for block in spec["content"]:
        block = dict(block)
        if block["type"] == "tool_use" and call_number > 1:
            block["id"] = f"{block['id']}_{call_number}"
        content.append(block)
    return Message.model_validate({
        "id": f"msg_{call_number}", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
        "content": content, "stop_reason": spec["stop_reason"], "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    })


class ScriptedClient:
    """Plays a scenario: returns its responses in order and remembers each history it was sent."""

    def __init__(self, case):
        self.case = case
        self.calls = []

    def create(self, messages):
        snapshot = []
        for m in messages:
            content = m["content"]
            snapshot.append({"role": m["role"], "content": list(content) if isinstance(content, list) else content})
        self.calls.append(snapshot)
        n = len(self.calls)
        specs = self.case["responses"]
        if self.case.get("repeat_forever"):
            if n > RUNAWAY_CUTOFF:
                return build_message({"stop_reason": "end_turn", "content": [{"type": "text", "text": "Stopping."}]}, n)
            return build_message(specs[0], n)
        return build_message(specs[min(n, len(specs)) - 1], 1)


def run_case(case, agent):
    """Returns (passed, reason) for one scenario."""
    expect = case["expect"]
    client = ScriptedClient(case)
    agent.TARE_LOG.clear()
    try:
        outcome = agent.run_agent(client, case["user"])
    except Exception as exc:
        return False, f"agent crashed: {type(exc).__name__}: {exc}"
    if not isinstance(outcome, dict):
        return False, "run_agent did not return a dictionary"
    if len(client.calls) > expect.get("max_api_calls", 99):
        return False, f"{len(client.calls)} API calls, expected at most {expect['max_api_calls']}"
    if outcome.get("status") != expect.get("status", "completed"):
        return False, f"status {outcome.get('status')!r}, expected {expect.get('status', 'completed')!r}"
    if "results" in expect:
        sent = []
        if len(client.calls) > 1:
            last = client.calls[1][-1]
            if last["role"] == "user" and isinstance(last["content"], list):
                sent = [{"id": b.get("tool_use_id"), "is_error": b.get("is_error") is True} for b in last["content"]]
        if sent != expect["results"]:
            return False, f"tool results {sent}, expected {expect['results']}"
    if "tare_executed" in expect and bool(agent.TARE_LOG) != expect["tare_executed"]:
        return False, "a tare was carried out without confirmation" if agent.TARE_LOG else "the tare was not carried out"
    if "final_text_contains" in expect and expect["final_text_contains"] not in str(outcome.get("final_text")):
        return False, f"final text {outcome.get('final_text')!r} does not mention {expect['final_text_contains']!r}"
    return True, "ok"


def load_cases():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "eval_cases.json"), encoding="utf-8") as fh:
        return json.load(fh)


def evaluate():
    import agent

    rows = []
    for case in load_cases():
        passed, reason = run_case(case, agent)
        rows.append({"id": case["id"], "name": case["name"], "passed": passed, "reason": reason})
    return rows


if __name__ == "__main__":
    rows = evaluate()
    for row in rows:
        print("PASS" if row["passed"] else "FAIL", f"{row['id']:>2}", row["name"], "" if row["passed"] else "- " + row["reason"])
    print(f"Score: {sum(1 for row in rows if row['passed'])}/{len(rows)}")
'''

TEST_AGENT_9C = '''"""Tests for the lab agent. Run evaluate.py for the scorecard; this file holds quick checks."""
import agent


def test_read_balance():
    assert agent.execute_tool("read_balance", {"balance_id": "XPR205"})["mass"] == 10.52


def test_check_temperature():
    assert agent.execute_tool("check_temperature", {"sensor_id": "TEMP02"})["temperature"] == 22.4


# Add a test for whatever you fix. Any function named test_... is run automatically.
''' + TEST_RUNNER

NOTE_9C = (
    "In this app: the project is in the file tabs above the editor. Run executes `evaluate.py`, which scores `agent.py` against the ten scenarios in `eval_cases.json`. "
    "Record the baseline score first. Then choose one important weakness yourself, fix its root cause in `agent.py`, and run the evaluation again. "
    "In the explanation box, give the baseline score, what you fixed and why you chose it, the score afterwards, and the risks that remain. Give yourself 55 minutes." + RUBRIC
)

WORKSPACE_9C = {"agent.py": AGENT_9C, "eval_cases.json": EVAL_CASES_9C, "evaluate.py": EVALUATE_9C, "test_agent.py": TEST_AGENT_9C}
