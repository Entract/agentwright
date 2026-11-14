"""Reference versions of the LAB-AGENT milestones.

They exist to prove the checks (a correct program passes, known mistakes fail) and for the
deliberate "start from a reference version" unlock. The app never puts one in the editor unasked.
"""

SOLUTIONS = {}
WRONG = {}

SHELL = '''
while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
    print("Agent:", reply(question))
'''

SOLUTIONS["LAB-01"] = '''# LAB-AGENT: my own agent. It grows one milestone at a time.

def reply(question):
    return "You said: " + question

''' + SHELL
WRONG["LAB-01"] = [
    ("never leaves the loop", SOLUTIONS["LAB-01"].replace("        break\n", "")),
    ("answers quit before stopping", '''def reply(question):
    return "You said: " + question

while True:
    question = input("You: ")
    print("Agent:", reply(question))
    if question == "quit":
        print("Goodbye")
        break
'''),
    ("reply prints instead of returning", '''def reply(question):
    print("You said: " + question)

while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
    print("Agent:", end=" ")
    reply(question)
'''),
    ("asks only once", '''def reply(question):
    return "You said: " + question

question = input("You: ")
while True:
    if question == "quit":
        print("Goodbye")
        break
    print("Agent:", reply(question))
    question = "quit"
'''),
]

BALANCE = '''def read_balance():
    return "+ 2.1319 g"

'''
REPLY_02 = '''def reply(question):
    if question == "weigh":
        return "The balance reads " + read_balance()
    return "You said: " + question

'''
SOLUTIONS["LAB-02"] = "# LAB-AGENT: my own agent. It grows one milestone at a time.\n\n" + BALANCE + "\n" + REPLY_02 + SHELL
WRONG["LAB-02"] = [
    ("types the reading again instead of calling the tool", SOLUTIONS["LAB-02"].replace('"The balance reads " + read_balance()', '"The balance reads + 2.1319 g"')),
    ("the tool prints instead of returning", SOLUTIONS["LAB-02"].replace('    return "+ 2.1319 g"', '    print("+ 2.1319 g")').replace('return "The balance reads " + read_balance()', 'read_balance()\n        return "done"')),
    ("reads the balance for every question", SOLUTIONS["LAB-02"].replace('    if question == "weigh":\n        return "The balance reads " + read_balance()\n    return "You said: " + question', '    reading = read_balance()\n    if question == "weigh":\n        return "The balance reads " + reading\n    return "You said: " + question')),
    ("reads once at the start and reuses it", SOLUTIONS["LAB-02"].replace('def reply(question):', 'reading = read_balance()\n\ndef reply(question):').replace('"The balance reads " + read_balance()', '"The balance reads " + reading')),
]
for _label, _program in WRONG["LAB-02"]:
    assert _program != SOLUTIONS["LAB-02"], _label

TOOLS = '''tools = [
    {
        "name": "read_balance",
        "description": "Reads the mass on the lab balance right now and returns it as the balance shows it, for example '+ 2.1319 g'.",
        "input_schema": {"type": "object", "properties": {}},
    }
]

'''
SOLUTIONS["LAB-03"] = "# LAB-AGENT: my own agent. It grows one milestone at a time.\n\n" + BALANCE + "\n" + REPLY_02 + "\n" + TOOLS + SHELL
WRONG["LAB-03"] = [
    ("a dictionary instead of a list", SOLUTIONS["LAB-03"].replace("tools = [\n    {", "tools = {").replace("    }\n]\n", "}\n")),
    ("a three-word description", SOLUTIONS["LAB-03"].replace("Reads the mass on the lab balance right now and returns it as the balance shows it, for example '+ 2.1319 g'.", "Reads the balance")),
    ("declares an argument the function does not take", SOLUTIONS["LAB-03"].replace('"properties": {}', '"properties": {"balance_id": {"type": "string"}}, "required": ["balance_id"]')),
    ("another format's key", SOLUTIONS["LAB-03"].replace('"input_schema"', '"parameters"')),
]
for _label, _program in WRONG["LAB-03"]:
    assert _program != SOLUTIONS["LAB-03"], _label

HEAD = '''# LAB-AGENT: my own agent. It grows one milestone at a time.
import fake_claude

client = fake_claude.FakeClient()

''' + BALANCE + "\n" + TOOLS

SOLUTIONS["LAB-04"] = HEAD + '''
while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": question}],
        tools=tools,
    )
    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
        if block.type == "tool_use":
            print("Claude asks to run", block.name, "with", block.input)
'''
WRONG["LAB-04"] = [
    ("does not send the tools", SOLUTIONS["LAB-04"].replace("        tools=tools,\n", "")),
    ("still runs the balance for the word weigh", SOLUTIONS["LAB-04"].replace('    response = client.messages.create(', '    if question == "weigh":\n        print("Agent: The balance reads", read_balance())\n        continue\n    response = client.messages.create(')),
    ("asks Claude before testing for quit", HEAD + '''
while True:
    question = input("You: ")
    response = client.messages.create(model="claude-opus-5-5", max_tokens=1024, messages=[{"role": "user", "content": question}], tools=tools)
    if question == "quit":
        print("Goodbye")
        break
    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
        if block.type == "tool_use":
            print("Claude asks to run", block.name, "with", block.input)
'''),
    ("prints only the first block", SOLUTIONS["LAB-04"].replace('''    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
        if block.type == "tool_use":
            print("Claude asks to run", block.name, "with", block.input)
''', '    print("Agent:", response.content[0].text)\n')),
    ("runs the balance already", SOLUTIONS["LAB-04"].replace('            print("Claude asks to run", block.name, "with", block.input)\n', '            print("Claude asks to run", block.name, "with", block.input)\n            print(read_balance())\n')),
    ("sends the question as a bare string", SOLUTIONS["LAB-04"].replace('messages=[{"role": "user", "content": question}]', 'messages=question')),
]
for _label, _program in WRONG["LAB-04"]:
    assert _program != SOLUTIONS["LAB-04"], _label

RUN_TOOL = '''
def run_tool(name, tool_input):
    if name == "read_balance":
        return read_balance()
    return "Unknown tool: " + name

'''
REQUEST = '''    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        messages=%s,
        tools=tools,
    )
'''
LOOP_TOP = '''
while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
'''
SOLUTIONS["LAB-05"] = HEAD + RUN_TOOL + LOOP_TOP + REQUEST % '[{"role": "user", "content": question}]' + '''    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
        if block.type == "tool_use":
            print("Claude asks to run", block.name, "with", block.input)
            result = run_tool(block.name, block.input)
            print("Tool result:", result)
'''
WRONG["LAB-05"] = [
    ("calls the balance directly and never uses run_tool", SOLUTIONS["LAB-05"].replace("result = run_tool(block.name, block.input)", "result = read_balance()")),
    ("run_tool runs the balance for any name", SOLUTIONS["LAB-05"].replace('    if name == "read_balance":\n        return read_balance()\n    return "Unknown tool: " + name', '    return read_balance()')),
    ("looks the function up by name", SOLUTIONS["LAB-05"].replace('    if name == "read_balance":\n        return read_balance()\n    return "Unknown tool: " + name', '    if name in globals():\n        return globals()[name]()\n    return "Unknown tool: " + name')),
    ("runs the tool for every block", SOLUTIONS["LAB-05"].replace('            result = run_tool(block.name, block.input)\n            print("Tool result:", result)\n', '        result = run_tool("read_balance", {})\n        print("Tool result:", result)\n')),
    ("run_tool returns nothing for unknown names", SOLUTIONS["LAB-05"].replace('    return "Unknown tool: " + name\n', '')),
]
for _label, _program in WRONG["LAB-05"]:
    assert _program != SOLUTIONS["LAB-05"], _label

MAKE_RESULT = '''
def make_tool_result(block, result):
    return {"type": "tool_result", "tool_use_id": block.id, "content": result}

'''
BLOCKS_06 = '''    results = []
    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
        if block.type == "tool_use":
            print("Claude asks to run", block.name, "with", block.input)
            result = run_tool(block.name, block.input)
            print("Tool result:", result)
            results.append(make_tool_result(block, result))
'''
SOLUTIONS["LAB-06"] = HEAD + RUN_TOOL + MAKE_RESULT + LOOP_TOP + REQUEST % '[{"role": "user", "content": question}]' + BLOCKS_06
WRONG["LAB-06"] = [
    ("uses the tool name as the id", SOLUTIONS["LAB-06"].replace('"tool_use_id": block.id', '"tool_use_id": block.name')),
    ("wrong type", SOLUTIONS["LAB-06"].replace('"type": "tool_result"', '"type": "tool_use"')),
    ("results is never emptied", SOLUTIONS["LAB-06"].replace("    results = []\n    for block", "    for block").replace("\nwhile True:", "\nresults = []\nwhile True:")),
    ("makes a result for text blocks too", SOLUTIONS["LAB-06"].replace('            results.append(make_tool_result(block, result))\n', '        results.append(make_tool_result(block, "none"))\n')),
    ("the result is nested in a dictionary", SOLUTIONS["LAB-06"].replace('"content": result}', '"content": {"reading": result}}')),
]
for _label, _program in WRONG["LAB-06"]:
    assert _program != SOLUTIONS["LAB-06"], _label

HISTORY_TOP = '''
messages = []

while True:
    question = input("You: ")
    if question == "quit":
        print("Goodbye")
        break
    messages.append({"role": "user", "content": question})
''' + REQUEST % "messages" + '''    messages.append({"role": "assistant", "content": response.content})
'''
FOLLOW_UP = '''        messages.append({"role": "user", "content": results})
''' + (REQUEST % "messages").replace("\n    ", "\n        ").replace("    response", "        response", 1) + '''        messages.append({"role": "assistant", "content": response.content})
'''
BLOCKS_07 = BLOCKS_06 + '''    if response.stop_reason == "tool_use":
''' + FOLLOW_UP + '''        for block in response.content:
            if block.type == "text":
                print("Agent:", block.text)
'''
SOLUTIONS["LAB-07"] = HEAD + RUN_TOOL + MAKE_RESULT + HISTORY_TOP + BLOCKS_07
WRONG["LAB-07"] = [
    ("forgets to append Claude's reply", SOLUTIONS["LAB-07"].replace('    messages.append({"role": "assistant", "content": response.content})\n    results', '    results')),
    ("sends each result as its own bare message", SOLUTIONS["LAB-07"].replace('messages.append({"role": "user", "content": results})', 'messages.append(results[0])')),
    ("starts a new history for every question", SOLUTIONS["LAB-07"].replace('\nmessages = []\n\nwhile True:\n    question = input("You: ")', '\nwhile True:\n    messages = []\n    question = input("You: ")')),
    ("never appends the final answer", SOLUTIONS["LAB-07"].replace('        messages.append({"role": "assistant", "content": response.content})\n        for block', '        for block')),
    ("does not send the results back", SOLUTIONS["LAB-07"].replace(BLOCKS_07, BLOCKS_06)),
    ("only the text of the reply is kept", SOLUTIONS["LAB-07"].replace('    messages.append({"role": "assistant", "content": response.content})\n    results', '    messages.append({"role": "assistant", "content": "ok"})\n    results')),
]
for _label, _program in WRONG["LAB-07"]:
    assert _program != SOLUTIONS["LAB-07"], _label

SOLUTIONS["LAB-08"] = HEAD + RUN_TOOL + MAKE_RESULT + HISTORY_TOP + '''    while response.stop_reason == "tool_use":
        results = []
        for block in response.content:
            if block.type == "text":
                print("Agent:", block.text)
            if block.type == "tool_use":
                print("Claude asks to run", block.name, "with", block.input)
                result = run_tool(block.name, block.input)
                print("Tool result:", result)
                results.append(make_tool_result(block, result))
''' + FOLLOW_UP + '''    for block in response.content:
        if block.type == "text":
            print("Agent:", block.text)
'''
WRONG["LAB-08"] = [
    ("still handles one round only", SOLUTIONS["LAB-07"]),
    ("loops but keeps re-running the first reply's tools", SOLUTIONS["LAB-08"].replace(FOLLOW_UP, '''        messages.append({"role": "user", "content": results})
        latest = client.messages.create(model="claude-opus-5-5", max_tokens=1024, messages=messages, tools=tools)
        messages.append({"role": "assistant", "content": latest.content})
        if latest.stop_reason != "tool_use":
            response = latest
''')),
    ("stops after a fixed two rounds without finishing", SOLUTIONS["LAB-08"].replace('    while response.stop_reason == "tool_use":', '    if response.stop_reason == "tool_use":')),
]
for _label, _program in WRONG["LAB-08"]:
    assert _program != SOLUTIONS["LAB-08"], _label
