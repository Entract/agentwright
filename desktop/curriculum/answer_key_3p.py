"""Answer key for the preparatory exercises 3P-A..3P-F. Shown only when the learner asks for a solution."""

SOLUTIONS = {}
WRONG = {}

HEAD_A = '''\
definition = tools[0]
for block in response.content:
    if block.type == "tool_use":
        request = block

'''
TAIL_A = '''
print(declared_name == requested_name)
print(declared_keys == requested_keys)
'''

SOLUTIONS["3P-A"] = HEAD_A + '''\
declared_name = definition["name"]
declared_keys = list(definition["input_schema"]["properties"])
requested_name = request.name
requested_keys = list(request.input)
''' + TAIL_A
WRONG["3P-A"] = [
    ("types the values in", HEAD_A + 'declared_name = "read_balance"\ndeclared_keys = ["balance_id"]\nrequested_name = "read_balance"\nrequested_keys = ["balance_id"]\n' + TAIL_A),
    ("reads everything from the request", HEAD_A + 'declared_name = request.name\ndeclared_keys = list(request.input)\nrequested_name = request.name\nrequested_keys = list(request.input)\n' + TAIL_A),
    ("uses required instead of properties, and the whole input dictionary", HEAD_A + 'declared_name = definition["name"]\ndeclared_keys = definition["input_schema"]["required"]\nrequested_name = request.name\nrequested_keys = request.input\n' + TAIL_A),
]

SOLUTIONS["3P-B"] = '''\
tools = [
    {
        "name": "read_balance",
        "description": "Reads the mass on the lab balance and returns it, for example '+ 2.1319 g'.",
        "input_schema": {"type": "object", "properties": {}},
    }
]

print(tools[0]["name"])
'''
WRONG["3P-B"] = [
    ("a dictionary instead of a list, and no schema", 'tools = {"name": "read_balance", "description": "Reads the mass on the lab balance."}\n\nprint(tools["name"])\n'),
    ("another format's key for the schema", 'tools = [{"name": "read_balance", "description": "Reads the mass on the lab balance.", "parameters": {"type": "object", "properties": {}}}]\n\nprint(tools[0]["name"])\n'),
    ("Python types instead of JSON Schema strings", 'tools = [{"name": "read_balance", "description": "Reads the mass on the lab balance.", "input_schema": {"type": dict, "properties": {}}}]\n\nprint(tools[0]["name"])\n'),
    ("one-word description", 'tools = [{"name": "read_balance", "description": "Balance", "input_schema": {"type": "object", "properties": {}}}]\n\nprint(tools[0]["name"])\n'),
    ("requires an argument that is not declared", 'tools = [{"name": "read_balance", "description": "Reads the mass on the lab balance.", "input_schema": {"type": "object", "properties": {}, "required": ["balance_id"]}}]\n\nprint(tools[0]["name"])\n'),
]


def definition_c(properties, rest=''):
    return '''\
tools = [
    {
        "name": "read_balance",
        "description": "Read a laboratory balance by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
''' + properties + '''            },
''' + rest + '''        },
    }
]

print(tools[0]["input_schema"])
'''


GOOD_PROPERTIES = '''\
                "balance_id": {"type": "string", "description": "The ID of the balance to read, for example XPR205"},
                "unit": {"type": "string", "enum": ["g", "mg"], "description": "The unit to report the mass in"},
'''
SOLUTIONS["3P-C"] = definition_c(GOOD_PROPERTIES, '            "required": ["balance_id"],\n')
WRONG["3P-C"] = [
    ("no required list", definition_c(GOOD_PROPERTIES)),
    ("both arguments required", definition_c(GOOD_PROPERTIES, '            "required": ["balance_id", "unit"],\n')),
    ("required written as a string", definition_c(GOOD_PROPERTIES, '            "required": "balance_id",\n')),
    ("no enum on unit", definition_c(GOOD_PROPERTIES.replace('"enum": ["g", "mg"], ', ''), '            "required": ["balance_id"],\n')),
    ("Python types", definition_c(GOOD_PROPERTIES.replace('"type": "string"', '"type": str'), '            "required": ["balance_id"],\n')),
    ("no descriptions", definition_c('                "balance_id": {"type": "string"},\n                "unit": {"type": "string", "enum": ["g", "mg"]},\n', '            "required": ["balance_id"],\n')),
]

TAIL_D = '''
for block in response.content:
    if block.type == "tool_use":
        print(check_request(id_tool, block))
        print(check_request(no_argument_tool, block))
'''
SOLUTIONS["3P-D"] = '''\
def check_request(definition, block):
    problems = []
    schema = definition["input_schema"]
    if block.name != definition["name"]:
        problems.append("wrong tool")
    for key in schema.get("required", []):
        if key not in block.input:
            problems.append("missing " + key)
    for key in block.input:
        if key not in schema["properties"]:
            problems.append("unexpected " + key)
    return problems
''' + TAIL_D
WRONG["3P-D"] = [
    ("crashes when there is no required list", SOLUTIONS["3P-D"].replace('schema.get("required", [])', 'schema["required"]')),
    ("treats optional arguments as required", SOLUTIONS["3P-D"].replace('schema.get("required", [])', 'schema["properties"]')),
    ("never checks the name", SOLUTIONS["3P-D"].replace('    if block.name != definition["name"]:\n        problems.append("wrong tool")\n', '')),
    ("returns at the first problem", SOLUTIONS["3P-D"].replace('            problems.append("missing " + key)\n', '            problems.append("missing " + key)\n            return problems\n')),
    ("never reports unexpected keys", SOLUTIONS["3P-D"].replace('    for key in block.input:\n        if key not in schema["properties"]:\n            problems.append("unexpected " + key)\n', '')),
]
for _label, _program in WRONG["3P-D"]:
    assert _program != SOLUTIONS["3P-D"], _label

SOLUTIONS["3P-E"] = '''\
results = []
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            results.append(read_balance())
        elif block.name == "check_temperature":
            results.append(check_temperature(block.input["sensor_id"]))
        else:
            results.append({"error": "no function for " + block.name})

print(results)
'''
WRONG["3P-E"] = [
    ("passes the whole input to every function", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            results.append(read_balance(**block.input))\n        elif block.name == "check_temperature":\n            results.append(check_temperature(**block.input))\n        else:\n            results.append({"error": "no function for " + block.name})\n\nprint(results)\n'),
    ("reads a balance_id that the definition never declared", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        if block.name == "read_balance":\n            results.append(read_balance(block.input["balance_id"]))\n        elif block.name == "check_temperature":\n            results.append(check_temperature(block.input["sensor_id"]))\n        else:\n            results.append({"error": "no function for " + block.name})\n\nprint(results)\n'),
    ("ignores tools that have no function", SOLUTIONS["3P-E"].replace('        else:\n            results.append({"error": "no function for " + block.name})\n', '')),
    ("looks the function up by name", 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        results.append(globals()[block.name](**block.input))\n\nprint(results)\n'),
]

HEAD_F = '''\
tools = [
    {
        "name": "read_balance",
        "description": "Read a laboratory balance by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {"balance_id": {"type": "string"}},
            "required": ["%s"],
        },
    }
]

'''
BODY_F = '''\
results = []
for block in response.content:
    if block.type == "tool_use":
        if block.name == "%s":
            results.append(read_balance(%s))

print(results)
'''
SOLUTIONS["3P-F"] = HEAD_F % "balance_id" + BODY_F % ("read_balance", 'block.input["balance_id"]')
WRONG["3P-F"] = [
    ("fixes the Python but leaves required misspelled", HEAD_F % "balanceId" + BODY_F % ("read_balance", 'block.input["balance_id"]')),
    ("types the ID in", HEAD_F % "balance_id" + BODY_F % ("read_balance", '"XPR205"')),
    ("removes the name test", HEAD_F % "balance_id" + 'results = []\nfor block in response.content:\n    if block.type == "tool_use":\n        results.append(read_balance(block.input["balance_id"]))\n\nprint(results)\n'),
    ("renames the definition to match the code", (HEAD_F % "balance_id").replace('"name": "read_balance"', '"name": "readBalance"') + BODY_F % ("read_balance", 'block.input["balance_id"]')),
    ("changes the schema key instead of the code", (HEAD_F % "id").replace('"properties": {"balance_id"', '"properties": {"id"') + BODY_F % ("read_balance", 'block.input["balance_id"]')),
]
