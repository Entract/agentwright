"""Answer key for modules 1-4. Never shown unless the learner explicitly asks for a solution.

SOLUTIONS: one reference solution per exercise (other correct programs pass too).
WRONG: known misconceptions that the checks must reject, as (label, program) pairs.
"""

SOLUTIONS = {}
WRONG = {}

SOLUTIONS["1A"] = '''\
for n in measurements:
    if n > 11:
        print(n)
'''
WRONG["1A"] = [("includes 11 and above", "for n in measurements:\n    if n >= 11:\n        print(n)\n"), ("hardcoded", "print(11.8)\nprint(12.4)\nprint(11.5)\n")]

SOLUTIONS["1B"] = '''\
count = 0
for n in measurements:
    if n > 11:
        count += 1
print(count)
'''
WRONG["1B"] = [
    ("counter reset inside the loop", "for n in measurements:\n    count = 0\n    if n > 11:\n        count += 1\nprint(count)\n"),
    ("prints running counts", "count = 0\nfor n in measurements:\n    if n > 11:\n        count += 1\n        print(count)\n"),
]

SOLUTIONS["1C"] = '''\
def count_high(measurements):
    count = 0
    for n in measurements:
        if n > 11:
            count += 1
    return count

print(count_high(measurements))
'''
WRONG["1C"] = [
    ("return inside the loop", "def count_high(measurements):\n    count = 0\n    for n in measurements:\n        if n > 11:\n            count += 1\n            return count\n    return count\n\nprint(count_high(measurements))\n"),
    ("prints instead of returning", "def count_high(measurements):\n    count = 0\n    for n in measurements:\n        if n > 11:\n            count += 1\n    print(count)\n\ncount_high(measurements)\n"),
]

SOLUTIONS["1D"] = '''\
def get_low(measurements):
    low = []
    for n in measurements:
        if n < 10:
            low.append(n)
    return low

print(get_low(measurements))
'''
WRONG["1D"] = [("returns inside the loop", "def get_low(measurements):\n    low = []\n    for n in measurements:\n        if n < 10:\n            low.append(n)\n            return low\n    return low\n\nprint(get_low(measurements))\n")]

SOLUTIONS["1E"] = '''\
def get_high(measurements):
    high = []
    for n in measurements:
        if n > 11:
            high.append(n)
    return high

result = get_high(measurements)
print(len(result))
print(result[0])
'''
WRONG["1E"] = [("calls the function twice", "def get_high(measurements):\n    high = []\n    for n in measurements:\n        if n > 11:\n            high.append(n)\n    return high\n\nprint(len(get_high(measurements)))\nprint(get_high(measurements)[0])\n")]

SOLUTIONS["1F"] = '''\
def first_high(measurements):
    for n in measurements:
        if n > 11:
            return n
    return None

print(first_high(measurements))
'''
WRONG["1F"] = [("returns the last match", "def first_high(measurements):\n    found = None\n    for n in measurements:\n        if n > 11:\n            found = n\n    return found\n\nprint(first_high(measurements))\n")]

SOLUTIONS["2A"] = '''\
print(response["content"][1]["input"]["balance_id"])
'''
WRONG["2A"] = [("hardcoded", 'print("XPR205")\n'), ("attribute access on a dict", "print(response.content[1].input['balance_id'])\n")]

SOLUTIONS["2B"] = '''\
for block in response["content"]:
    if block["type"] == "tool_use":
        print(block["name"])
'''
WRONG["2B"] = [("fixed indices", 'print(response["content"][1]["name"])\nprint(response["content"][2]["name"])\n'), ("no type filter", 'for block in response["content"]:\n    print(block["name"])\n')]

SOLUTIONS["2C"] = '''\
for block in response.content:
    if block.type == "tool_use":
        print(block.name)
'''
WRONG["2C"] = [("dictionary syntax on SDK objects", 'for block in response.content:\n    if block["type"] == "tool_use":\n        print(block["name"])\n')]

SOLUTIONS["2D"] = '''\
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            print(block.input["balance_id"])
'''
WRONG["2D"] = [
    ("no name check", 'for block in response.content:\n    if block.type == "tool_use":\n        print(block.input["balance_id"])\n'),
    ("fixed index", 'print(response.content[1].input["balance_id"])\n'),
    ("attribute access on the input dict", 'for block in response.content:\n    if block.type == "tool_use" and block.name == "read_balance":\n        print(block.input.balance_id)\n'),
]

SOLUTIONS["2E"] = '''\
def unit_for(block):
    return block.input.get("unit", "g")

for block in response.content:
    if block.type == "tool_use" and block.name == "read_balance":
        print(unit_for(block))
'''
WRONG["2E"] = [
    ("always g", 'def unit_for(block):\n    return "g"\n\nfor block in response.content:\n    if block.type == "tool_use" and block.name == "read_balance":\n        print(unit_for(block))\n'),
    ("writes the default into the request", 'def unit_for(block):\n    return block.input.setdefault("unit", "g")\n\nfor block in response.content:\n    if block.type == "tool_use" and block.name == "read_balance":\n        print(unit_for(block))\n'),
]

SOLUTIONS["2F"] = '''\
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            print(block.name + ":" + block.input["balance_id"])
        elif block.name == "check_temperature":
            print(block.name + ":" + block.input["sensor_id"])
'''
WRONG["2F"] = [("reads both keys for every tool", 'for block in response.content:\n    if block.type == "tool_use":\n        print(block.name + ":" + block.input.get("balance_id", "") + block.input.get("sensor_id", "x")[:0])\n')]

SOLUTIONS["2G"] = '''\
if response.stop_reason == "tool_use":
    print("needs_tools")
else:
    print("finished")
'''
WRONG["2G"] = [("always needs_tools", 'print("needs_tools")\n')]

SOLUTIONS["3A"] = '''\
for block in response.content:
    if block.type == "tool_use" and block.name == "read_balance":
        result = read_balance(block.input["balance_id"])
        print(result)
'''
WRONG["3A"] = [
    ("prints the request instead of running the tool", 'for block in response.content:\n    if block.type == "tool_use" and block.name == "read_balance":\n        print(block.input)\n'),
    ("hardcoded ID", 'for block in response.content:\n    if block.type == "tool_use" and block.name == "read_balance":\n        print(read_balance("XPR205"))\n'),
    ("runs for any tool", 'for block in response.content:\n    if block.type == "tool_use":\n        print(read_balance(block.input.get("balance_id", "XPR205")))\n'),
]

SOLUTIONS["3B"] = '''\
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            print(read_balance(block.input["balance_id"]))
        elif block.name == "check_temperature":
            print(check_temperature(block.input["sensor_id"]))
'''
WRONG["3B"] = [
    ("stores IDs in the loop, calls both afterwards", 'for block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            balance_id = block.input["balance_id"]\n        elif block.name == "check_temperature":\n            sensor_id = block.input["sensor_id"]\nprint(read_balance(balance_id))\nprint(check_temperature(sensor_id))\n'),
    ("no type filter", 'for block in response.content:\n    if block.name == "read_balance":\n        print(read_balance(block.input["balance_id"]))\n    elif block.name == "check_temperature":\n        print(check_temperature(block.input["sensor_id"]))\n'),
]

SOLUTIONS["3C"] = '''\
results = []
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            result = read_balance(block.input["balance_id"])
            results.append(result)
        elif block.name == "check_temperature":
            result = check_temperature(block.input["sensor_id"])
            results.append(result)

print(results)
'''
WRONG["3C"] = [
    ("still prints inside the branches", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            print(read_balance(block.input["balance_id"]))\n        elif block.name == "check_temperature":\n            print(check_temperature(block.input["sensor_id"]))\n\nprint(results)\n'),
    ("prints inside and appends", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            result = read_balance(block.input["balance_id"])\n            print(result)\n            results.append(result)\n        elif block.name == "check_temperature":\n            result = check_temperature(block.input["sensor_id"])\n            print(result)\n            results.append(result)\n\nprint(results)\n'),
    ("calls each tool twice", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            read_balance(block.input["balance_id"])\n            results.append(read_balance(block.input["balance_id"]))\n        elif block.name == "check_temperature":\n            check_temperature(block.input["sensor_id"])\n            results.append(check_temperature(block.input["sensor_id"]))\n\nprint(results)\n'),
    ("appends the request, not the result", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        results.append(block.input)\n\nprint(results)\n'),
]

SOLUTIONS["3D"] = '''\
def execute_tool(name, args):
    if name == "read_balance":
        return read_balance(args["balance_id"])
    elif name == "check_temperature":
        return check_temperature(args["sensor_id"])
    else:
        return {"error": "unknown tool: " + name}

print(execute_tool("read_balance", {"balance_id":"XPR205"}))
'''
WRONG["3D"] = [
    ("looks the function up by name", 'def execute_tool(name, args):\n    fn = globals().get(name)\n    if fn is None:\n        return {"error": "unknown tool: " + name}\n    return fn(*args.values())\n\nprint(execute_tool("read_balance", {"balance_id":"XPR205"}))\n'),
    ("no unknown branch", 'def execute_tool(name, args):\n    if name == "read_balance":\n        return read_balance(args["balance_id"])\n    elif name == "check_temperature":\n        return check_temperature(args["sensor_id"])\n\nprint(execute_tool("read_balance", {"balance_id":"XPR205"}))\n'),
]

SOLUTIONS["3E"] = '''\
executions = []
for block in response.content:
    if block.type == "tool_use":
        result = execute_tool(block.name, block.input)
        executions.append({"id": block.id, "name": block.name, "result": result})
'''
WRONG["3E"] = [("no type filter", 'executions = []\nfor block in response.content:\n    result = execute_tool(getattr(block, "name", "text"), getattr(block, "input", {}))\n    executions.append({"id": getattr(block, "id", None), "name": getattr(block, "name", "text"), "result": result})\n')]

SOLUTIONS["3F"] = '''\
print(tools[0]["input_schema"]["required"][0])
'''
WRONG["3F"] = [("hardcoded", 'print("balance_id")\n')]

SOLUTIONS["3G"] = '''\
def safe_read_balance(args):
    if "balance_id" not in args:
        return {"error": "missing balance_id"}
    balance_id = args["balance_id"]
    if not isinstance(balance_id, str) or balance_id == "":
        return {"error": "invalid balance_id"}
    return read_balance(balance_id)
'''
WRONG["3G"] = [
    ("no type check", 'def safe_read_balance(args):\n    if not args.get("balance_id"):\n        return {"error": "missing balance_id"}\n    return read_balance(args["balance_id"])\n'),
    ("calls the instrument first", 'def safe_read_balance(args):\n    result = read_balance(args.get("balance_id"))\n    if "balance_id" not in args:\n        return {"error": "missing balance_id"}\n    if not isinstance(args["balance_id"], str) or not args["balance_id"]:\n        return {"error": "invalid balance_id"}\n    return result\n'),
]

SOLUTIONS["4A"] = '''\
import json
for block in response.content:
    if block.type == "tool_use":
        result = read_balance(block.input["balance_id"])
        tool_result = {
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(result),
        }
        print(tool_result)
'''
WRONG["4A"] = [
    ("content is a dict, not JSON text", 'import json\nfor block in response.content:\n    if block.type == "tool_use":\n        result = read_balance(block.input["balance_id"])\n        tool_result = {"type": "tool_result", "tool_use_id": block.id, "content": result}\n        print(tool_result)\n'),
    ("hardcoded id", 'import json\nfor block in response.content:\n    if block.type == "tool_use":\n        result = read_balance(block.input["balance_id"])\n        tool_result = {"type": "tool_result", "tool_use_id": "toolu_bal", "content": json.dumps(result)}\n        print(tool_result)\n'),
    ("uses the tool name as the id", 'import json\nfor block in response.content:\n    if block.type == "tool_use":\n        result = read_balance(block.input["balance_id"])\n        tool_result = {"type": "tool_result", "tool_use_id": block.name, "content": json.dumps(result)}\n        print(tool_result)\n'),
    ("str() instead of json.dumps", 'for block in response.content:\n    if block.type == "tool_use":\n        result = read_balance(block.input["balance_id"])\n        tool_result = {"type": "tool_result", "tool_use_id": block.id, "content": str(result)}\n        print(tool_result)\n'),
]

SOLUTIONS["4B"] = '''\
import json
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
print(tool_results)
'''
WRONG["4B"] = [
    ("overwrites the list each time", 'import json\ntool_results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            result = read_balance(block.input["balance_id"])\n        elif block.name == "check_temperature":\n            result = check_temperature(block.input["sensor_id"])\n        tool_results = [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]\nprint(tool_results)\n'),
    ("same id for every result", 'import json\ntool_results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            result = read_balance(block.input["balance_id"])\n        elif block.name == "check_temperature":\n            result = check_temperature(block.input["sensor_id"])\n        tool_results.append({"type": "tool_result", "tool_use_id": response.content[1].id, "content": json.dumps(result)})\nprint(tool_results)\n'),
]

SOLUTIONS["4C"] = '''\
messages.append({"role": "assistant", "content": response.content})
print(messages[-1]["role"])
print(len(messages[-1]["content"]))
'''
WRONG["4C"] = [
    ("appends only the first block", 'messages.append({"role": "assistant", "content": [response.content[0]]})\nprint(messages[-1]["role"])\nprint(len(messages[-1]["content"]))\n'),
    ("wrong role", 'messages.append({"role": "user", "content": response.content})\nprint(messages[-1]["role"])\nprint(len(messages[-1]["content"]))\n'),
    ("replaces the history", 'messages = [{"role": "assistant", "content": response.content}]\nprint(messages[-1]["role"])\nprint(len(messages[-1]["content"]))\n'),
]

SOLUTIONS["4D"] = '''\
import json
messages.append({"role": "assistant", "content": response.content})

tool_results = []
for block in response.content:
    if block.type == "tool_use":
        result = read_balance(block.input["balance_id"])
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": json.dumps(result),
        })

messages.append({"role": "user", "content": tool_results})

for message in messages:
    print(message["role"])
'''
WRONG["4D"] = [
    ("result sent as assistant", 'import json\nmessages.append({"role": "assistant", "content": response.content})\nblock = response.content[0]\nresult = read_balance(block.input["balance_id"])\nmessages.append({"role": "assistant", "content": [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]})\n'),
    ("result before the request", 'import json\nblock = response.content[0]\nresult = read_balance(block.input["balance_id"])\nmessages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]})\nmessages.append({"role": "assistant", "content": response.content})\n'),
    ("forgets the assistant turn", 'import json\nblock = response.content[0]\nresult = read_balance(block.input["balance_id"])\nmessages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]})\n'),
    ("hardcoded id and index", 'import json\nmessages.append({"role": "assistant", "content": response.content})\nresult = read_balance(response.content[0].input["balance_id"])\nmessages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_bal", "content": json.dumps(result)}]})\n'),
]

SOLUTIONS["4E"] = '''\
import json
messages.append({"role": "assistant", "content": response.content})

tool_results = []
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            result = read_balance(block.input["balance_id"])
        elif block.name == "check_temperature":
            result = check_temperature(block.input["sensor_id"])
        tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)})

messages.append({"role": "user", "content": tool_results})
print(len(messages))
print(len(messages[-1]["content"]))
'''
WRONG["4E"] = [("one user message per result", 'import json\nmessages.append({"role": "assistant", "content": response.content})\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            result = read_balance(block.input["balance_id"])\n        elif block.name == "check_temperature":\n            result = check_temperature(block.input["sensor_id"])\n        messages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]})\nprint(len(messages))\nprint(len(messages[-1]["content"]))\n')]

SOLUTIONS["4F"] = '''\
import json

def send(messages):
    last = messages[-1]
    if last["role"] != "user":
        return "rejected"
    content = last["content"]
    if not isinstance(content, list) or len(content) == 0:
        return "rejected"
    first = content[0]
    if first.get("type") != "tool_result":
        return "rejected"
    if first.get("tool_use_id") != "toolu_bal":
        return "rejected"
    return "received"

messages.append({"role": "assistant", "content": response.content})
block = response.content[0]
result = read_balance(block.input["balance_id"])
messages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]})
print(send(messages))
'''
WRONG["4F"] = [("always received", 'import json\n\ndef send(messages):\n    return "received"\n\nmessages.append({"role": "assistant", "content": response.content})\nblock = response.content[0]\nresult = read_balance(block.input["balance_id"])\nmessages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}]})\nprint(send(messages))\n')]

SOLUTIONS["4G"] = '''\
import json
messages.append({"role":"assistant","content":response.content})
messages.append({"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_bal","content":"ok"}]})
'''
WRONG["4G"] = [("adds the right order after the wrong one", 'import json\nmessages.append({"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_bal","content":"ok"}]})\nmessages.append({"role":"assistant","content":response.content})\nmessages.append({"role":"assistant","content":response.content})\nmessages.append({"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_bal","content":"ok"}]})\n')]

SOLUTIONS["4H"] = '''\
def record_tool_turn(messages, response, tool_results):
    messages.append({"role": "assistant", "content": response.content})
    messages.append({"role": "user", "content": tool_results})
    return messages
'''
WRONG["4H"] = [
    ("builds a fresh list", 'def record_tool_turn(messages, response, tool_results):\n    messages = [messages[0]]\n    messages.append({"role": "assistant", "content": response.content})\n    messages.append({"role": "user", "content": tool_results})\n    return messages\n'),
    ("forgets to return", 'def record_tool_turn(messages, response, tool_results):\n    messages.append({"role": "assistant", "content": response.content})\n    messages.append({"role": "user", "content": tool_results})\n'),
    ("one user message per result", 'def record_tool_turn(messages, response, tool_results):\n    messages.append({"role": "assistant", "content": response.content})\n    for r in tool_results:\n        messages.append({"role": "user", "content": [r]})\n    return messages\n'),
]
