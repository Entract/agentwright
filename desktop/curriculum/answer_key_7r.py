"""Answer key for the code-reading exercises 7R-A..7R-F. Shown only when the learner asks for a solution."""

SOLUTIONS = {}
WRONG = {}

SOLUTIONS["7R-A"] = '''\
import instruments
print(instruments.read_balance("XPR205"))

from instruments import read_balance
print(read_balance("XPR205"))

import instruments as lab
print(lab.read_balance("XPR205"))
'''
WRONG["7R-A"] = [
    ("prints the first form three times", 'import instruments\nprint(instruments.read_balance("XPR205"))\nprint(instruments.read_balance("XPR205"))\nprint(instruments.read_balance("XPR205"))\n'),
    ("imports both ways but never uses them", 'import instruments\nfrom instruments import read_balance\nimport instruments as lab\nprint(instruments.read_balance("XPR205"))\nprint(instruments.read_balance("XPR205"))\nprint(instruments.read_balance("XPR205"))\n'),
    ("copies the function instead of importing it", 'import instruments\nprint(instruments.read_balance("XPR205"))\n\ndef read_balance(balance_id):\n    return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}\n\nprint(read_balance("XPR205"))\nimport instruments as lab\nprint(lab.read_balance("XPR205"))\n'),
    ("renames the function instead of the module", 'import instruments\nprint(instruments.read_balance("XPR205"))\nfrom instruments import read_balance\nprint(read_balance("XPR205"))\nfrom instruments import read_balance as lab\nprint(lab("XPR205"))\n'),
]

SOLUTIONS["7R-B"] = '''\
balance = Balance("XPR205")
balance.read()
result = balance.read()
count = balance.readings
other = Balance("AB104", unit="mg")

print(result)
print(count)
print(other.unit)
'''
WRONG["7R-B"] = [
    ("passes self by hand", 'balance = Balance(None, "XPR205")\nbalance.read()\nresult = balance.read()\ncount = balance.readings\nother = Balance("AB104", unit="mg")\n\nprint(result)\nprint(count)\nprint(other.unit)\n'),
    ("reads only once", 'balance = Balance("XPR205")\nresult = balance.read()\ncount = balance.readings\nother = Balance("AB104", unit="mg")\n\nprint(result)\nprint(count)\nprint(other.unit)\n'),
    ("types the count", 'balance = Balance("XPR205")\nbalance.read()\nresult = balance.read()\ncount = 2\nother = Balance("AB104", unit="mg")\n\nprint(result)\nprint(count)\nprint(other.unit)\n'),
    ("uses the same object twice", 'balance = Balance("XPR205")\nbalance.read()\nresult = balance.read()\ncount = balance.readings\nother = balance\nother.unit = "mg"\n\nprint(result)\nprint(count)\nprint(other.unit)\n'),
    ("keeps the method instead of calling it", 'balance = Balance("XPR205")\nbalance.read()\nbalance.read()\nresult = balance.read\ncount = balance.readings\nother = Balance("AB104", unit="mg")\n\nprint(result)\nprint(count)\nprint(other.unit)\n'),
]

ANSWERS_C = '''\
error_type = "KeyError"
failed_in = "run_tool"
failed_line = 17
missing_key = "sensor"

'''
TAIL_C = '''
print(error_type, failed_in, failed_line, missing_key)
print(outcome)
'''
CALL_C = 'run_tool("check_temperature", {"sensor_id": "TEMP02"})'
SOLUTIONS["7R-C"] = ANSWERS_C + "try:\n    outcome = " + CALL_C + "\nexcept KeyError as exc:\n    outcome = \"missing key: \" + str(exc)\n" + TAIL_C
WRONG["7R-C"] = [
    ("reads the first frame of the traceback instead of the last", ANSWERS_C.replace('"run_tool"', '"<module>"').replace("17", "41") + "try:\n    outcome = " + CALL_C + "\nexcept KeyError as exc:\n    outcome = \"missing key: \" + str(exc)\n" + TAIL_C),
    ("does not catch the error", ANSWERS_C + "outcome = " + CALL_C + "\n" + TAIL_C),
    ("types the outcome without calling anything", ANSWERS_C + "outcome = \"missing key: 'sensor'\"\n" + TAIL_C),
    ("a bare except", ANSWERS_C + "try:\n    outcome = " + CALL_C + "\nexcept:\n    outcome = \"missing key: 'sensor'\"\n" + TAIL_C),
    ("throws the result away", ANSWERS_C + "outcome = None\ntry:\n    " + CALL_C + "\nexcept KeyError as exc:\n    outcome = \"missing key: \" + str(exc)\n" + TAIL_C),
    ("line number as text", ANSWERS_C.replace("failed_line = 17", 'failed_line = "17"') + "try:\n    outcome = " + CALL_C + "\nexcept KeyError as exc:\n    outcome = \"missing key: \" + str(exc)\n" + TAIL_C),
]

TAIL_D = '''
print(answer_a, answer_b, answer_c)
print(python_checks_hints)
print(describe("TEMP02", 22.4))
'''
SOLUTIONS["7R-D"] = '''\
answer_a = "10.50 g"
answer_b = "2.135 mg"
answer_c = "7 g"

python_checks_hints = False

def describe(sensor_id, temperature):
    return f"{sensor_id}: {temperature} C"
''' + TAIL_D
_D = SOLUTIONS["7R-D"]
WRONG["7R-D"] = [
    ("forgets the two decimal places", _D.replace('"10.50 g"', '"10.5 g"')),
    ("does not round", _D.replace('"2.135 mg"', '"2.13456 mg"')),
    ("thinks hints are enforced", _D.replace("python_checks_hints = False", "python_checks_hints = True")),
    ("describe returns fixed text", _D.replace('return f"{sensor_id}: {temperature} C"', 'return "TEMP02: 22.4 C"')),
    ("describe prints instead of returning", _D.replace('return f"{sensor_id}: {temperature} C"', 'print(f"{sensor_id}: {temperature} C")')),
    ("answers left as the calls' results", _D.replace('answer_a = "10.50 g"', "answer_a = None")),
]
for _label, _program in WRONG["7R-D"]:
    assert _program != _D, _label

SOLUTIONS["7R-E"] = '''\
@tool
def check_temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}

names = sorted(TOOLS)
reading = TOOLS["read_balance"]()

print(names)
print(reading)
'''
_E = SOLUTIONS["7R-E"]
WRONG["7R-E"] = [
    ("no decorator: the function is never registered", _E.replace("@tool\n", "")),
    ("adds it to TOOLS by hand", _E.replace("@tool\n", "").replace("\nnames = ", '\nTOOLS["check_temperature"] = check_temperature\nnames = ')),
    ("keeps the function instead of calling it", _E.replace('TOOLS["read_balance"]()', 'TOOLS["read_balance"]')),
    ("types the names", _E.replace("sorted(TOOLS)", '["check_temperature", "read_balance"]')),
    ("calls read_balance by its own name", _E.replace('TOOLS["read_balance"]()', "read_balance()")),
    ("ignores the argument", _E.replace('{"sensor_id": sensor_id,', '{"sensor_id": "TEMP02",')),
]
for _label, _program in WRONG["7R-E"]:
    assert _program != _E, _label

HEAD_F = '''\
names = [block.name for block in response.content if block.type == "tool_use"]
inputs = {block.name: block.input for block in response.content if block.type == "tool_use"}

'''
TAIL_F = '''
print(names_loop)
print(needs)
print(answer)
'''
SOLUTIONS["7R-F"] = HEAD_F + '''\
names_loop = []
for block in response.content:
    if block.type == "tool_use":
        names_loop.append(block.name)

needs = []
for name, tool_input in inputs.items():
    needs.append(f"{name}: {tool_input}")

answer = "\\n".join(block.text for block in response.content if block.type == "text")
''' + TAIL_F
_F = SOLUTIONS["7R-F"]
WRONG["7R-F"] = [
    ("copies names instead of looping", _F.replace('names_loop = []\nfor block in response.content:\n    if block.type == "tool_use":\n        names_loop.append(block.name)\n', "names_loop = names\n").replace("for name, tool_input in inputs.items():\n    needs.append", "for name, tool_input in inputs.items():\n    needs.append")),
    ("forgets the type test", _F.replace('    if block.type == "tool_use":\n        names_loop.append(block.name)\n', '    names_loop.append(getattr(block, "name", "text"))\n')),
    ("loops over the keys only", _F.replace('for name, tool_input in inputs.items():\n    needs.append(f"{name}: {tool_input}")', 'for name in inputs:\n    needs.append(f"{name}: {inputs[name]}")')),
    ("takes only the first text block", _F.replace('answer = "\\n".join(block.text for block in response.content if block.type == "text")', "answer = response.content[0].text")),
    ("joins with a space", _F.replace('"\\n".join', '" ".join')),
    ("types the results in", HEAD_F + 'names_loop = ["read_balance", "check_temperature"]\nneeds = ["read_balance: {\'balance_id\': \'XPR205\'}", "check_temperature: {\'sensor_id\': \'TEMP02\'}"]\nanswer = "I\'ll check the instruments."\n' + TAIL_F),
]
for _label, _program in WRONG["7R-F"]:
    assert _program != _F, _label
