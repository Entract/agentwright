"""Reference versions of LAB-09 to LAB-12. See answer_key_lab.py for what they are for."""

SOLUTIONS = {}
WRONG = {}

BANNER = "# LAB-AGENT: my own agent. It grows one milestone at a time.\n"

IMPORTS_09 = '''import json

import fake_claude

client = fake_claude.FakeClient()
'''

INSTRUMENTS = '''

def read_balance():
    return "+ 2.1319 g"


def check_temperature(sensor_id):
    if sensor_id == "TEMP00":
        raise RuntimeError("No reply from sensor TEMP00")
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}

'''

TOOLS = '''
tools = [
    {
        "name": "read_balance",
        "description": "Reads the mass on the lab balance right now and returns it as the balance shows it, for example '+ 2.1319 g'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "check_temperature",
        "description": "Reads one temperature sensor by its ID and returns the temperature in degrees C.",
        "input_schema": {
            "type": "object",
            "properties": {"sensor_id": {"type": "string", "description": "The ID of the sensor, for example TEMP02"}},
            "required": ["sensor_id"],
        },
    },
]

'''

RUN_TOOL = '''
def run_tool(name, tool_input):
    if name == "read_balance":
        return read_balance()
    if name == "check_temperature":
        return json.dumps(check_temperature(tool_input["sensor_id"]))
    raise ValueError("Unknown tool: " + name)


def make_tool_result(block, result, is_error=False):
    return {"type": "tool_result", "tool_use_id": block.id, "content": result, "is_error": is_error}

'''

CREATE = '''client.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        messages=messages,
        tools=tools,
    )'''

TOOL_ROUND = '''        results = []
        for block in response.content:
            if block.type == "text":
                print("Agent:", block.text)
            if block.type == "tool_use":
                print("Claude asks to run", block.name, "with", block.input)
                try:
                    result = run_tool(block.name, block.input)
                    is_error = False
                except Exception as exc:
                    result = "Tool failed: " + type(exc).__name__ + ": " + str(exc)
                    is_error = True
                print("Tool result:", result)
                results.append(make_tool_result(block, result, is_error))
        messages.append({"role": "user", "content": results})
'''


def chat_loop(request):
    return '''
messages = []

while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
    messages.append({"role": "user", "content": question})
    response = ''' + request + '''
    messages.append({"role": "assistant", "content": response.content})
    while response.stop_reason == "tool_use":
''' + TOOL_ROUND + '''        response = ''' + request.replace("\n    ", "\n        ") + '''
        messages.append({"role": "assistant", "content": response.content})
    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
'''


SOLUTIONS["LAB-09"] = BANNER + IMPORTS_09 + INSTRUMENTS + TOOLS + RUN_TOOL + chat_loop(CREATE)

_09 = SOLUTIONS["LAB-09"]
WRONG["LAB-09"] = [
    ("no try/except: a failing tool crashes the program", _09.replace('''                try:
                    result = run_tool(block.name, block.input)
                    is_error = False
                except Exception as exc:
                    result = "Tool failed: " + type(exc).__name__ + ": " + str(exc)
                    is_error = True
''', '''                result = run_tool(block.name, block.input)
                is_error = False
''')),
    ("catches the failure but does not mark it", _09.replace("                    is_error = True\n", "                    is_error = False\n")),
    ("unknown tools return text and are not marked as errors", _09.replace('    raise ValueError("Unknown tool: " + name)', '    return "Unknown tool: " + name')),
    ("sends the temperature dictionary without turning it into text", _09.replace('return json.dumps(check_temperature(tool_input["sensor_id"]))', 'return check_temperature(tool_input["sensor_id"])')),
    ("the sensor never fails", _09.replace('    if sensor_id == "TEMP00":\n        raise RuntimeError("No reply from sensor TEMP00")\n', '')),
    ("check_temperature is not declared to Claude", _09.replace(TOOLS, TOOLS.split('    {\n        "name": "check_temperature"')[0] + "]\n\n")),
    ("uses a fixed sensor instead of the one asked for", _09.replace('check_temperature(tool_input["sensor_id"])', 'check_temperature("TEMP01")')),
    ("drops the result of a failed tool", _09.replace('''                print("Tool result:", result)
                results.append(make_tool_result(block, result, is_error))
''', '''                print("Tool result:", result)
                if not is_error:
                    results.append(make_tool_result(block, result, is_error))
''')),
    ("marks every result as an error", _09.replace("                    is_error = False\n", "                    is_error = True\n")),
]
for _label, _program in WRONG["LAB-09"]:
    assert _program != _09, _label

IMPORTS_10 = '''import json
import os

import fake_claude

LIVE = os.environ.get("LAB_AGENT_LIVE") == "1"
if LIVE:
    import anthropic

    client = anthropic.Anthropic()
    print("Mode: LIVE - real requests to Claude")
else:
    client = fake_claude.FakeClient()
    print("Mode: simulated")
'''

CALL_10 = '''
def call_claude(messages):
    return client.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        messages=messages,
        tools=tools,
    )

'''

SOLUTIONS["LAB-10"] = BANNER + IMPORTS_10 + INSTRUMENTS + TOOLS + RUN_TOOL + CALL_10 + chat_loop("call_claude(messages)")
_10 = SOLUTIONS["LAB-10"]
WRONG["LAB-10"] = [
    ("always creates the real client", _10.replace('LIVE = os.environ.get("LAB_AGENT_LIVE") == "1"', "LIVE = True")),
    ("goes live for any value of the variable", _10.replace('LIVE = os.environ.get("LAB_AGENT_LIVE") == "1"', 'LIVE = "LAB_AGENT_LIVE" in os.environ')),
    ("never goes live", _10.replace('LIVE = os.environ.get("LAB_AGENT_LIVE") == "1"', "LIVE = False")),
    ("writes a key into the program", _10.replace("client = anthropic.Anthropic()", 'client = anthropic.Anthropic(api_key="sk-ant-EXAMPLE-NOT-A-KEY")')),
    ("call_claude exists but the loop does not use it", _10.replace(chat_loop("call_claude(messages)"), chat_loop(CREATE))),
    ("does not say which mode it is in", _10.replace('    print("Mode: LIVE - real requests to Claude")\n', '').replace('    print("Mode: simulated")\n', '')),
    ("creates both clients", _10.replace("if LIVE:\n    import anthropic\n\n    client = anthropic.Anthropic()", "import anthropic\n\nreal = anthropic.Anthropic()\nif LIVE:\n    client = real")),
]
for _label, _program in WRONG["LAB-10"]:
    assert _program != _10, _label

RULES = '''
rules = """You are a careful assistant in a chemistry lab. You can read the lab balance and the temperature sensors with your tools.
Only report readings that a tool returned in this conversation. Never guess, estimate or invent a reading.
If a tool fails, tell the user plainly what the error said and what they could check. Do not call the same tool again unless the user asks."""

'''
TOOLS_11 = TOOLS.replace(
    "Reads the mass on the lab balance right now and returns it as the balance shows it, for example '+ 2.1319 g'.",
    "Reads the mass on the lab balance right now and returns it as the balance shows it: sign, value and unit, for example '+ 2.1319 g'. One call gives one reading.",
).replace(
    "Reads one temperature sensor by its ID and returns the temperature in degrees C.",
    "Reads one temperature sensor by its ID and returns JSON with the sensor_id, the temperature and the unit (C). If the sensor does not reply, the result is an error naming the sensor.",
)
assert TOOLS_11 != TOOLS
CALL_11 = CALL_10.replace("        tools=tools,\n", "        tools=tools,\n        system=rules,\n")

SOLUTIONS["LAB-11"] = BANNER + IMPORTS_10 + RULES + INSTRUMENTS + TOOLS_11 + RUN_TOOL + CALL_11 + chat_loop("call_claude(messages)")
_11 = SOLUTIONS["LAB-11"]
WRONG["LAB-11"] = [
    ("writes rules but never sends them", _11.replace("        system=rules,\n", "")),
    ("puts the rules in a message with the role system", _11.replace("        system=rules,\n", "").replace('\nmessages = []\n', '\nmessages = [{"role": "system", "content": rules}]\n')),
    ("a one-line system prompt", _11.replace(RULES, '\nrules = "You are a helpful lab assistant."\n\n')),
    ("rules that say nothing about failures or made-up readings", _11.replace(RULES, '\nrules = "You are a friendly assistant in a chemistry lab with a balance. Be polite and brief and always answer in clear plain English sentences so that everyone in the lab can follow you easily."\n\n')),
    ("sends the rules as the first user message instead", _11.replace("        system=rules,\n", "").replace('    messages.append({"role": "user", "content": question})', '    messages.append({"role": "user", "content": rules + " " + question})')),
    ("tool descriptions left short", BANNER + IMPORTS_10 + RULES + INSTRUMENTS + TOOLS + RUN_TOOL + CALL_11 + chat_loop("call_claude(messages)")),
]
for _label, _program in WRONG["LAB-11"]:
    assert _program != _11, _label

ASK = '''
def ask(question, messages):
    messages.append({"role": "user", "content": question})
    response = call_claude(messages)
    messages.append({"role": "assistant", "content": response.content})
    while response.stop_reason == "tool_use":
''' + TOOL_ROUND + '''        response = call_claude(messages)
        messages.append({"role": "assistant", "content": response.content})
    return "\\n".join(block.text for block in response.content if block.type == "text")


messages = []

while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
    print("Agent:", ask(question, messages))
'''

SOLUTIONS["LAB-12"] = BANNER + IMPORTS_10 + RULES + INSTRUMENTS + TOOLS_11 + RUN_TOOL + CALL_11 + ASK
_12 = SOLUTIONS["LAB-12"]
WRONG["LAB-12"] = [
    ("not reorganised at all", _11),
    ("ask prints the answer and returns nothing", _12.replace('    return "\\n".join(block.text for block in response.content if block.type == "text")', '    for block in response.content:\n        if block.type == "text":\n            print("Agent:", block.text)').replace('    print("Agent:", ask(question, messages))', '    ask(question, messages)')),
    ("ask ignores the list it is given and uses the global one", _12.replace("def ask(question, messages):", "history = []\n\n\ndef ask(question, unused):\n    messages = history")),
    ("ask handles only one round", _12.replace('    while response.stop_reason == "tool_use":\n' + TOOL_ROUND, '    if response.stop_reason == "tool_use":\n' + TOOL_ROUND)),
    ("ask calls the client directly instead of call_claude", _12.replace("    response = call_claude(messages)\n    messages.append", "    response = client.messages.create(model=\"claude-opus-5-5\", max_tokens=1024, messages=messages, tools=tools, system=rules)\n    messages.append")),
    ("ask returns the messages list", _12.replace('    return "\\n".join(block.text for block in response.content if block.type == "text")', '    return messages')),
]
for _label, _program in WRONG["LAB-12"]:
    assert _program != _12, _label
