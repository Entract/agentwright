"""Answer key for the timed projects. Each solution is a whole workspace (file name -> source)."""
from workspaces_9 import AGENT_9A, AGENT_9B, AGENT_9C, SCHEMAS_9B, TEST_AGENT_9A, TEST_AGENT_9B, TEST_RUNNER, TOOLS_9B, WORKSPACE_9A, WORKSPACE_9B, WORKSPACE_9C

SOLUTIONS = {}
WRONG = {}


def with_test(source, extra):
    """Inserts an extra test above the runner block at the end of a test file."""
    return source.replace(TEST_RUNNER, "\n" + extra + TEST_RUNNER)


# --------------------------------------------------------------------------- 9A

FIXED_AGENT_9A = '''"""The balance assistant: asks the (fake) model, runs the tools it requests, returns its final answer."""
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
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                })
        messages.append({"role": "user", "content": tool_results})
        response = client.create(messages)
        rounds += 1
    return "\\n".join(block.text for block in response.content if block.type == "text")
'''

REGRESSION_9A = '''def test_history_has_no_duplicate_result_messages():
    client = FakeClient([two_tool_request(), final_answer()])
    run_agent(client, "Read the balance and the temperature.")
    assert len(client.calls[1]) == 3, f"expected 3 messages on the second call, got {len(client.calls[1])}"
'''

SOLUTIONS["9A"] = {**WORKSPACE_9A, "agent.py": FIXED_AGENT_9A, "test_agent.py": with_test(TEST_AGENT_9A, REGRESSION_9A)}

STILL_CALLS_INSIDE_LOOP = AGENT_9A.replace('''                if not tool_results:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
''', '''                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                })
''').replace("    return response.content[-1].text", '    return "\\n".join(block.text for block in response.content if block.type == "text")')
assert STILL_CALLS_INSIDE_LOOP != AGENT_9A

LAST_TEXT_ONLY = FIXED_AGENT_9A.replace('    return "\\n".join(block.text for block in response.content if block.type == "text")', "    return response.content[-1].text")
assert LAST_TEXT_ONLY != FIXED_AGENT_9A

WRONG["9A"] = [
    ("fixes two causes but still calls the model inside the tool loop", {**WORKSPACE_9A, "agent.py": STILL_CALLS_INSIDE_LOOP, "test_agent.py": with_test(TEST_AGENT_9A, REGRESSION_9A)}),
    ("fixes the loop but still takes the last block's text", {**WORKSPACE_9A, "agent.py": LAST_TEXT_ONLY, "test_agent.py": with_test(TEST_AGENT_9A, REGRESSION_9A)}),
    ("fixes everything but adds no regression test", {**WORKSPACE_9A, "agent.py": FIXED_AGENT_9A}),
]

# --------------------------------------------------------------------------- 9B

STABILITY_BRANCH = '''    if name == "check_stability":
        return check_stability(args.get("masses"))
    return {"error": "unknown tool: " + name}
'''

STABILITY_FUNCTION = '''

def check_stability(masses):
    """Stable when the spread of at least three readings is at most 0.02 g."""
    if not isinstance(masses, list) or len(masses) < 3:
        return {"error": "masses must be a list of at least three numbers"}
    for mass in masses:
        if isinstance(mass, bool) or not isinstance(mass, (int, float)):
            return {"error": "every mass must be a number"}
    spread = max(masses) - min(masses)
    return {"stable": spread <= 0.02, "range": spread}

'''

FIXED_TOOLS_9B = TOOLS_9B.replace('\n\ndef execute_tool(name, args):', STABILITY_FUNCTION + '\ndef execute_tool(name, args):').replace('    return {"error": "unknown tool: " + name}\n', STABILITY_BRANCH)
assert "check_stability" in FIXED_TOOLS_9B and FIXED_TOOLS_9B.count("def check_stability") == 1

STABILITY_SCHEMA = '''    {
        "name": "check_stability",
        "description": "Decide whether a series of at least three balance readings is stable (spread of at most 0.02 g).",
        "input_schema": {
            "type": "object",
            "properties": {"masses": {"type": "array", "items": {"type": "number"}, "minItems": 3}},
            "required": ["masses"],
        },
    },
]
'''
FIXED_SCHEMAS_9B = SCHEMAS_9B.rstrip()[:-1].rstrip() + "\n" + STABILITY_SCHEMA
assert FIXED_SCHEMAS_9B.count('"name"') == 3

TESTS_9B = '''def test_check_stability_stable_and_unstable():
    assert execute_tool("check_stability", {"masses": [10.52, 10.53, 10.52]})["stable"] is True
    assert execute_tool("check_stability", {"masses": [10.0, 10.05, 10.02]})["stable"] is False


def test_check_stability_rejects_bad_input():
    assert "error" in execute_tool("check_stability", {})
    assert "error" in execute_tool("check_stability", {"masses": [10.5, 10.6]})
    assert "error" in execute_tool("check_stability", {"masses": [10.5, "x", 10.6]})
'''

SOLUTIONS["9B"] = {**WORKSPACE_9B, "tools.py": FIXED_TOOLS_9B, "schemas.py": FIXED_SCHEMAS_9B, "test_agent.py": with_test(TEST_AGENT_9B, TESTS_9B)}

NO_VALIDATION = FIXED_TOOLS_9B.replace('''    if not isinstance(masses, list) or len(masses) < 3:
        return {"error": "masses must be a list of at least three numbers"}
    for mass in masses:
        if isinstance(mass, bool) or not isinstance(mass, (int, float)):
            return {"error": "every mass must be a number"}
''', "")
assert NO_VALIDATION != FIXED_TOOLS_9B
STRICT_BOUNDARY = FIXED_TOOLS_9B.replace("spread <= 0.02", "spread < 0.015")
assert STRICT_BOUNDARY != FIXED_TOOLS_9B

WRONG["9B"] = [
    ("no input validation", {**WORKSPACE_9B, "tools.py": NO_VALIDATION, "schemas.py": FIXED_SCHEMAS_9B, "test_agent.py": with_test(TEST_AGENT_9B, TESTS_9B.split("\n\n\n")[0] + "\n")}),
    ("tool added but not described in the schema", {**WORKSPACE_9B, "tools.py": FIXED_TOOLS_9B, "test_agent.py": with_test(TEST_AGENT_9B, TESTS_9B)}),
    ("wrong stability threshold", {**WORKSPACE_9B, "tools.py": STRICT_BOUNDARY, "schemas.py": FIXED_SCHEMAS_9B, "test_agent.py": with_test(TEST_AGENT_9B, TESTS_9B)}),
    ("works but has no tests for the new tool", {**WORKSPACE_9B, "tools.py": FIXED_TOOLS_9B, "schemas.py": FIXED_SCHEMAS_9B}),
]

# --------------------------------------------------------------------------- 9C

# The reference fix deals with one root cause: a tool that fails (unknown name, missing argument,
# instrument exception) crashed the whole agent. It now becomes an error result. Wrong argument
# types, the unconfirmed tare and the missing round limit are deliberately left as remaining risks.
FIXED_AGENT_9C = AGENT_9C.replace('''                result = execute_tool(block.name, block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
''', '''                try:
                    result = execute_tool(block.name, block.input)
                except Exception as exc:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": "Tool failed: " + type(exc).__name__ + ": " + str(exc),
                        "is_error": True,
                    })
                    continue
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
''')
assert FIXED_AGENT_9C != AGENT_9C

SOLUTIONS["9C"] = {**WORKSPACE_9C, "agent.py": FIXED_AGENT_9C}

EVERYTHING_IS_AN_ERROR = AGENT_9C.replace('''                result = execute_tool(block.name, block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})
''', '''                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": "tools are disabled", "is_error": True})
''')
assert EVERYTHING_IS_AN_ERROR != AGENT_9C

EDITS_THE_CASES_ONLY = dict(WORKSPACE_9C)
EDITS_THE_CASES_ONLY["eval_cases.json"] = "[]\n"

WRONG["9C"] = [
    ("turns every tool call into an error", {**WORKSPACE_9C, "agent.py": EVERYTHING_IS_AN_ERROR}),
    ("changes the scenarios instead of the agent", EDITS_THE_CASES_ONLY),
]
