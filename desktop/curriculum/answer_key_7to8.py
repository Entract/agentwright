"""Answer key for modules 7 and 8. Never shown unless the learner explicitly asks for a solution."""

SOLUTIONS = {}
WRONG = {}

SOLUTIONS["7A"] = '''\
for block in response["content"]:
    if block["type"] == "tool_use":
        print(block["name"])
'''
WRONG["7A"] = [("fixes only the loop line", 'for block in response["content"]:\n    if block.type == "tool_use":\n        print(block.name)\n'), ("fixed indices", 'print(response["content"][1]["name"])\nprint(response["content"][2]["name"])\n')]

SOLUTIONS["7B"] = '''\
def count_high(measurements):
    count = 0
    for n in measurements:
        if n > 11:
            count += 1
    return count
'''
WRONG["7B"] = [("moves the return inside the loop body but outside the if", "def count_high(measurements):\n    count = 0\n    for n in measurements:\n        if n > 11:\n            count += 1\n        return count\n    return count\n")]

SOLUTIONS["7C"] = '''\
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            print(read_balance(block.input["balance_id"]))
        elif block.name == "check_temperature":
            print(check_temperature(block.input["sensor_id"]))
'''
WRONG["7C"] = [
    ("guards with defaults but still calls outside the loop", 'balance_id = None\nsensor_id = None\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            balance_id = block.input["balance_id"]\n        elif block.name == "check_temperature":\n            sensor_id = block.input["sensor_id"]\n\nif balance_id:\n    print(read_balance(balance_id))\nif sensor_id:\n    print(check_temperature(sensor_id))\n'),
]

SOLUTIONS["7D"] = '''\
import json
messages.append({"role": "assistant", "content": response.content})

tool_results = []
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            result = read_balance(block.input["balance_id"])
        elif block.name == "check_temperature":
            result = check_temperature(block.input["sensor_id"])
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(result),
        })

messages.append({"role": "user", "content": tool_results})
print(tool_results)
'''
WRONG["7D"] = [
    ("hardcodes the two ids", 'import json\nmessages.append({"role": "assistant", "content": response.content})\nids = ["toolu_1", "toolu_2"]\ntool_results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            result = read_balance(block.input["balance_id"])\n        elif block.name == "check_temperature":\n            result = check_temperature(block.input["sensor_id"])\n        tool_results.append({"type": "tool_result", "tool_use_id": ids[len(tool_results)], "content": json.dumps(result)})\nmessages.append({"role": "user", "content": tool_results})\n'),
    ("uses the tool name as the id", 'import json\nmessages.append({"role": "assistant", "content": response.content})\ntool_results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            result = read_balance(block.input["balance_id"])\n        elif block.name == "check_temperature":\n            result = check_temperature(block.input["sensor_id"])\n        tool_results.append({"type": "tool_result", "tool_use_id": block.name, "content": json.dumps(result)})\nmessages.append({"role": "user", "content": tool_results})\n'),
]

SOLUTIONS["7E"] = '''\
def execute_tool(name, args):
    if name == "read_balance":
        if "balance_id" not in args:
            return {"error": "missing balance_id"}
        return read_balance(args["balance_id"])
    elif name == "check_temperature":
        if "sensor_id" not in args:
            return {"error": "missing sensor_id"}
        return check_temperature(args["sensor_id"])
    else:
        return {"error": "unknown tool: " + name}

for block in response.content:
    if block.type == "tool_use":
        print(execute_tool(block.name, block.input))
'''
WRONG["7E"] = [
    ("helper prints instead of returning", 'def execute_tool(name, args):\n    if name == "read_balance":\n        if "balance_id" not in args:\n            print({"error": "missing balance_id"})\n        else:\n            print(read_balance(args["balance_id"]))\n    elif name == "check_temperature":\n        if "sensor_id" not in args:\n            print({"error": "missing sensor_id"})\n        else:\n            print(check_temperature(args["sensor_id"]))\n    else:\n        print({"error": "unknown tool: " + name})\n\nfor block in response.content:\n    if block.type == "tool_use":\n        execute_tool(block.name, block.input)\n'),
    ("loses the missing-argument branch", 'def execute_tool(name, args):\n    if name == "read_balance":\n        return read_balance(args["balance_id"])\n    elif name == "check_temperature":\n        return check_temperature(args["sensor_id"])\n    else:\n        return {"error": "unknown tool: " + name}\n\nfor block in response.content:\n    if block.type == "tool_use":\n        print(execute_tool(block.name, block.input))\n'),
    ("looks the function up by name", 'def execute_tool(name, args):\n    fn = globals().get(name)\n    if name not in ("read_balance", "check_temperature"):\n        return {"error": "unknown tool: " + name}\n    key = "balance_id" if name == "read_balance" else "sensor_id"\n    if key not in args:\n        return {"error": "missing " + key}\n    return fn(args[key])\n\nfor block in response.content:\n    if block.type == "tool_use":\n        print(execute_tool(block.name, block.input))\n'),
]

SOLUTIONS["7F"] = '''\
def run(response):
    actions = []
    for block in response.content:
        if block.type == "tool_use":
            if block.name == "read_balance":
                actions.append(read_balance(block.input["balance_id"]))
            elif block.name == "check_temperature":
                actions.append(check_temperature(block.input["sensor_id"]))
    return actions

print(run(response))
'''
WRONG["7F"] = [("moves the return to the temperature branch", 'def run(response):\n    actions = []\n    for block in response.content:\n        if block.type == "tool_use":\n            if block.name == "read_balance":\n                actions.append(read_balance(block.input["balance_id"]))\n            elif block.name == "check_temperature":\n                actions.append(check_temperature(block.input["sensor_id"]))\n                return actions\n    return actions\n\nprint(run(response))\n')]

SOLUTIONS["8A"] = '''\
result = read_balance("XPR205")
assert result["balance_id"] == "XPR205"
assert isinstance(result["mass"], (int, float))
assert result["unit"] == "g"
'''
WRONG["8A"] = [
    ("asserts that are always true", 'result = read_balance("XPR205")\nassert result\nassert "mass" in result\nassert "unit" in result\n'),
    ("only two fields checked", 'result = read_balance("XPR205")\nassert result["balance_id"] == "XPR205"\nassert result["unit"] == "g"\n'),
]

SOLUTIONS["8B"] = '''\
tests = [([], 0), ([11], 0), ([12,13], 2)]
for values, expected in tests:
    assert count_high(values) == expected
'''
WRONG["8B"] = [
    ("checks only the type", "tests = [([], 0), ([11], 0), ([12,13], 2)]\nfor values, expected in tests:\n    assert isinstance(count_high(values), int)\n"),
    ("tests only the first case", "tests = [([], 0), ([11], 0), ([12,13], 2)]\nvalues, expected = tests[0]\nassert count_high(values) == expected\n"),
]

SOLUTIONS["8C"] = '''\
cases = [
    ("read_balance", {"balance_id":"XPR205"}),
    ("check_temperature", {"sensor_id":"TEMP02"}),
    ("nonexistent", {}),
    ("read_balance", {})
]
expected = [
    {"balance_id": "XPR205", "mass": 10.52, "unit": "g"},
    {"sensor_id": "TEMP02", "temperature": 22.4, "unit": "C"},
    "error",
    "error",
]

records = []
for (name, args), want in zip(cases, expected):
    try:
        got = execute_tool(name, args)
    except Exception:
        records.append({"case": name, "passed": False})
        continue
    if want == "error":
        passed = isinstance(got, dict) and "error" in got
    else:
        passed = got == want
    records.append({"case": name, "passed": passed})

print(sum(1 for record in records if record["passed"]))
'''
WRONG["8C"] = [
    ("passes anything that returns a dictionary", 'cases = [("read_balance", {"balance_id":"XPR205"}), ("check_temperature", {"sensor_id":"TEMP02"}), ("nonexistent", {}), ("read_balance", {})]\nrecords = []\nfor name, args in cases:\n    try:\n        got = execute_tool(name, args)\n        records.append({"case": name, "passed": isinstance(got, dict)})\n    except Exception:\n        records.append({"case": name, "passed": False})\nprint(sum(1 for r in records if r["passed"]))\n'),
    ("crashes when the dispatcher raises", 'cases = [("read_balance", {"balance_id":"XPR205"}), ("check_temperature", {"sensor_id":"TEMP02"}), ("nonexistent", {}), ("read_balance", {})]\nexpected = [{"balance_id": "XPR205", "mass": 10.52, "unit": "g"}, {"sensor_id": "TEMP02", "temperature": 22.4, "unit": "C"}, "error", "error"]\nrecords = []\nfor (name, args), want in zip(cases, expected):\n    got = execute_tool(name, args)\n    passed = ("error" in got) if want == "error" else got == want\n    records.append({"case": name, "passed": passed})\nprint(sum(1 for r in records if r["passed"]))\n'),
]

SOLUTIONS["8D"] = '''\
def validate_history(messages):
    for index, message in enumerate(messages):
        content = message["content"]
        if message["role"] != "assistant" or not isinstance(content, list):
            continue
        requested = [block["id"] for block in content if block.get("type") == "tool_use"]
        if not requested:
            continue
        if index + 1 >= len(messages):
            return False
        following = messages[index + 1]
        if following["role"] != "user" or not isinstance(following["content"], list):
            return False
        answered = [block.get("tool_use_id") for block in following["content"] if block.get("type") == "tool_result"]
        if sorted(answered) != sorted(requested):
            return False
    # A tool_result that answers nothing is also invalid.
    for index, message in enumerate(messages):
        content = message["content"]
        if message["role"] == "user" and isinstance(content, list):
            ids = [block.get("tool_use_id") for block in content if block.get("type") == "tool_result"]
            if ids:
                previous = messages[index - 1] if index > 0 else None
                if previous is None or previous["role"] != "assistant" or not isinstance(previous["content"], list):
                    return False
    return True
'''
WRONG["8D"] = [
    ("checks ids anywhere in the history, not adjacency", 'def validate_history(messages):\n    requested, answered = [], []\n    for message in messages:\n        if isinstance(message["content"], list):\n            for block in message["content"]:\n                if block.get("type") == "tool_use":\n                    requested.append(block["id"])\n                if block.get("type") == "tool_result":\n                    answered.append(block["tool_use_id"])\n    return sorted(requested) == sorted(answered)\n'),
    ("uses sets, so a duplicate result passes", 'def validate_history(messages):\n    for index, message in enumerate(messages):\n        content = message["content"]\n        if message["role"] != "assistant" or not isinstance(content, list):\n            continue\n        requested = {b["id"] for b in content if b.get("type") == "tool_use"}\n        if not requested:\n            continue\n        if index + 1 >= len(messages):\n            return False\n        following = messages[index + 1]\n        if following["role"] != "user" or not isinstance(following["content"], list):\n            return False\n        answered = {b.get("tool_use_id") for b in following["content"] if b.get("type") == "tool_result"}\n        if answered != requested:\n            return False\n    return True\n'),
    ("always True", "def validate_history(messages):\n    return True\n"),
]

SOLUTIONS["8E"] = '''\
def safe_call(balance_id):
    try:
        return {"is_error": False, "content": flaky_read_balance(balance_id)}
    except RuntimeError as exc:
        return {"is_error": True, "content": str(exc)}

records = []
for _ in range(4):
    records.append(safe_call("XPR205"))

assert [record["is_error"] for record in records] == [False, True, False, True]
assert records[0]["content"]["mass"] == 10.52
assert "timeout" in records[1]["content"]
print(records)
'''
WRONG["8E"] = [
    ("retries until it works", 'def safe_call(balance_id):\n    for _ in range(3):\n        try:\n            return {"is_error": False, "content": flaky_read_balance(balance_id)}\n        except RuntimeError as exc:\n            last = str(exc)\n    return {"is_error": True, "content": last}\n\nrecords = [safe_call("XPR205") for _ in range(4)]\nassert len(records) == 4\nassert records[0]["is_error"] is False\nprint(records)\n'),
    ("asserts nothing about the error path", 'def safe_call(balance_id):\n    try:\n        return {"is_error": False, "content": flaky_read_balance(balance_id)}\n    except RuntimeError as exc:\n        return {"is_error": True, "content": str(exc)}\n\nrecords = [safe_call("XPR205") for _ in range(4)]\nassert len(records) == 4\nassert isinstance(records, list)\nprint(records)\n'),
]

SOLUTIONS["8F"] = '''\
# The assistant asked for toolu_1. Its result must be the very next message.
# The user's extra text can follow the result instead of sitting in between.
fixed_messages = [
    {"role": "assistant", "content": [
        {"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {}}
    ]},
    {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "toolu_1", "content": "10.52 g"},
        {"type": "text", "text": "Thanks, please continue"},
    ]},
]
print(len(fixed_messages))
'''
WRONG["8F"] = [
    ("deletes the user text", 'fixed_messages = [\n    {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {}}]},\n    {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "10.52 g"}]},\n]\n'),
    ("leaves the order as it was", 'fixed_messages = [\n    {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_1", "name": "read_balance", "input": {}}]},\n    {"role": "user", "content": "Thanks, please continue"},\n    {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "10.52 g"}]},\n]\n'),
]
