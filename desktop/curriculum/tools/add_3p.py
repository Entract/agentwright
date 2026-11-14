"""Adds the six preparatory exercises 3P-A..3P-F to the manifest, before 3A. Safe to run twice."""
import json
import sys

path = sys.argv[1]
manifest = json.load(open(path, encoding="utf-8"))

FIXTURES = {
    "two_balance_definitions": '''# Two different designs for a tool with the same name. Both are valid; they are different contracts.
no_argument_tool = {
    "name": "read_balance",
    "description": "Reads the mass on the lab balance and returns it, for example '+ 2.1319 g'.",
    "input_schema": {"type": "object", "properties": {}},
}
id_tool = {
    "name": "read_balance",
    "description": "Read a laboratory balance by its ID.",
    "input_schema": {
        "type": "object",
        "properties": {
            "balance_id": {"type": "string"},
            "unit": {"type": "string", "enum": ["g", "mg"]},
        },
        "required": ["balance_id"],
    },
}''',
    "declared_tools_and_functions": '''# What Claude is told exists (the definitions) ...
tools = [
    {"name": "read_balance",
     "description": "Reads the mass on the one connected lab balance, for example '+ 2.1319 g'.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "check_temperature",
     "description": "Read a temperature sensor by its ID.",
     "input_schema": {"type": "object", "properties": {"sensor_id": {"type": "string"}}, "required": ["sensor_id"]}},
    {"name": "open_door",
     "description": "Open the draft shield door of the balance.",
     "input_schema": {"type": "object", "properties": {}}},
]

# ... and what your Python can actually do. There is no open_door function:
# writing a definition does not create one.
def read_balance():
    return "+ 2.1319 g"

def check_temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}''',
    "sdk_no_argument_request": '''from anthropic.types import Message
response = Message.model_validate({
    "id":"msg_noarg", "type":"message", "role":"assistant", "model":"claude-opus-5-5",
    "content":[
        {"type":"text", "text":"I'll read the balance and the temperature."},
        {"type":"tool_use", "id":"toolu_bal", "name":"read_balance", "input":{}},
        {"type":"tool_use", "id":"toolu_temp", "name":"check_temperature", "input":{"sensor_id":"TEMP02"}}
    ],
    "stop_reason":"tool_use", "stop_sequence":None,
    "usage":{"input_tokens":0,"output_tokens":0}
})''',
}

NOTE = "Added to the pack's 58 exercises on 2026-11-12 as preparation for 3A (who defines what in tool use)."

EXERCISES = [
    {
        "id": "3P-A",
        "title": "Who defines what",
        "module": "3",
        "priority": "P0",
        "mode": "trace",
        "fixtures": ["schema_templates", "sdk_balance_only"],
        "lesson": [
            "Three parties each write a different part of tool use.",
            "Anthropic defines the envelope: a response has `content` blocks; a tool request is a block with `type`, `id`, `name` and `input`; `stop_reason` says why Claude stopped. That shape is the same for every tool anyone ever writes.",
            "You, the developer, define the tools: each tool's `name`, its `description`, and its `input_schema`, which lists the argument names and types. You also write the Python function that does the work.",
            "Claude decides, each turn, whether to ask for a tool, which one, and what values to put in the arguments. It can only use the names and argument keys you declared.",
            "So `balance_id` appears in `block.input` because the definition in `tools` declares it. Nobody at Anthropic chose that key, and Claude did not invent it.",
        ],
        "task": "`definition` is what you declared and `request` is what Claude sent back. Replace each `None` by reading from one of them (do not type the values), so that both comparisons print `True`. Then write three short sentences in the explanation box: what Anthropic defines, what you define, and what Claude decides.",
        "starter": "definition = tools[0]              # written by you, the developer\nfor block in response.content:     # written by Claude, in Anthropic's format\n    if block.type == \"tool_use\":\n        request = block\n\n# Replace each None by reading from `definition` or `request`.\ndeclared_name = None     # the tool name you declared\ndeclared_keys = None     # list of the argument names you declared (the keys of \"properties\")\nrequested_name = None    # the tool name Claude asked for\nrequested_keys = None    # list of the argument names Claude supplied\n\nprint(declared_name == requested_name)\nprint(declared_keys == requested_keys)",
        "tests": [
            "declared_name and declared_keys are read from the definition",
            "requested_name and requested_keys are read from the tool_use block",
            "prints True then True for the matching pair",
            "still correct for a different tool; prints False when Claude's keys differ",
            "explanation separates Anthropic, developer and Claude",
        ],
        "hints": [
            "The definition is a dictionary: `definition[\"name\"]`. The request is an SDK object: `request.name`.",
            "The declared argument names are the keys of `definition[\"input_schema\"][\"properties\"]`. `list(some_dict)` gives a list of its keys.",
            "`request.input` is a plain dictionary, so `list(request.input)` gives the argument names Claude supplied.",
        ],
        "concepts": ["tool definition", "tool_use block", "contract", "who defines what"],
        "author_notes": NOTE,
    },
    {
        "id": "3P-B",
        "title": "Define a tool with no arguments",
        "module": "3",
        "priority": "P0",
        "mode": "write",
        "fixtures": [],
        "lesson": [
            "A tool definition is a dictionary with three keys. `name` is what Claude will ask for. `description` is plain English that tells Claude what the tool does and when to use it. `input_schema` describes the arguments.",
            "`input_schema` is always `{\"type\": \"object\", \"properties\": {...}}`. Each entry in `properties` is one argument. An empty `properties` means the tool takes no arguments, which is right when your program already knows which instrument it is connected to.",
            "For such a tool Claude's request arrives with `input` equal to `{}`.",
        ],
        "task": "Create `tools`, a list holding one tool definition for a tool named `read_balance` that takes no arguments. Give it a description of at least five words saying what it does or returns. Keep the last line, which prints the tool's name.",
        "starter": "tools = [\n    # one dictionary with \"name\", \"description\" and \"input_schema\"\n]\n\nprint(tools[0][\"name\"])",
        "tests": [
            "tools is a list with one dictionary",
            "name is read_balance and the description is a real sentence",
            "input_schema has type object and empty properties",
            "nothing is marked required",
            "the definition is plain data (can be sent as JSON)",
        ],
        "hints": [
            "Start with `{\"name\": \"read_balance\", \"description\": \"...\", \"input_schema\": {...}}` inside the list.",
            "The schema for no arguments is `{\"type\": \"object\", \"properties\": {}}`.",
            "`\"object\"` is a string in quotes. It is JSON Schema's word for a dictionary, not a Python type.",
        ],
        "concepts": ["tool definition", "input_schema", "no-argument tool"],
        "author_notes": NOTE,
    },
    {
        "id": "3P-C",
        "title": "Declare required and optional arguments",
        "module": "3",
        "priority": "P0",
        "mode": "write",
        "fixtures": [],
        "lesson": [
            "To let Claude choose between several balances, the tool needs an argument. You declare it under `properties`, with a type and preferably a description: `\"balance_id\": {\"type\": \"string\", \"description\": \"...\"}`.",
            "`required` is a list of the argument names Claude must always send. Anything in `properties` but not in `required` is optional, and Claude may leave it out.",
            "`\"enum\": [\"g\", \"mg\"]` restricts an argument to the listed values.",
            "This schema is about what goes into the tool. It says nothing about what the tool returns; your Python function decides that.",
        ],
        "task": "Complete the definition so that `read_balance` takes `balance_id` (a string, required) and `unit` (a string, optional, one of `g` or `mg`). Give each argument a short `description`.",
        "starter": "tools = [\n    {\n        \"name\": \"read_balance\",\n        \"description\": \"Read a laboratory balance by its ID.\",\n        \"input_schema\": {\n            \"type\": \"object\",\n            \"properties\": {\n                # \"balance_id\": a string, with a description\n                # \"unit\": a string, one of \"g\" or \"mg\", with a description\n            },\n            # which arguments must Claude always send?\n        },\n    }\n]\n\nprint(tools[0][\"input_schema\"])",
        "tests": [
            "properties declares balance_id and unit, both of type string",
            "required is the list [\"balance_id\"]; unit is optional",
            "unit is limited to g and mg with enum",
            "each argument has a description",
            "types are JSON Schema strings, not Python types",
        ],
        "hints": [
            "Each argument is its own small dictionary: `\"balance_id\": {\"type\": \"string\", \"description\": \"Which balance to read\"}`.",
            "Add `\"required\": [\"balance_id\"]` beside `\"properties\"`, inside `input_schema`. It is a list, even with one name.",
            "For `unit`, add `\"enum\": [\"g\", \"mg\"]` next to its `\"type\"`. Leave `unit` out of `required`.",
        ],
        "concepts": ["input_schema", "required", "optional arguments", "enum"],
        "author_notes": NOTE,
    },
    {
        "id": "3P-D",
        "title": "Compare a request with its definition",
        "module": "3",
        "priority": "P0",
        "mode": "write",
        "fixtures": ["two_balance_definitions", "sdk_balance_only"],
        "lesson": [
            "Before writing a dispatcher, read the definition: it tells you which keys `block.input` will have. The same request can fit one definition and not another.",
            "Here Claude's request is `read_balance` with `{\"balance_id\": \"XPR205\"}`. That fits `id_tool`. It does not fit `no_argument_tool`, which declares no arguments at all.",
        ],
        "task": "Complete `check_request(definition, block)` so it returns a list of problems: `\"wrong tool\"` if the names differ, `\"missing <key>\"` for each required key absent from `block.input`, and `\"unexpected <key>\"` for each key in `block.input` that the definition does not declare. A request that fits returns `[]`.",
        "starter": "def check_request(definition, block):\n    problems = []\n    schema = definition[\"input_schema\"]\n    # 1. block.name must equal the declared name, otherwise add \"wrong tool\"\n    # 2. each key in schema.get(\"required\", []) must be in block.input, otherwise add \"missing <key>\"\n    # 3. each key in block.input must be in schema[\"properties\"], otherwise add \"unexpected <key>\"\n    return problems\n\nfor block in response.content:\n    if block.type == \"tool_use\":\n        print(check_request(id_tool, block))\n        print(check_request(no_argument_tool, block))",
        "tests": [
            "a request that fits returns []",
            "the same request against the no-argument definition returns ['unexpected balance_id']",
            "a missing required key is reported; a missing optional key is not",
            "a different tool name is reported as wrong tool",
            "a definition with no required list does not crash",
        ],
        "hints": [
            "`problems.append(\"missing \" + key)` builds the message for one key.",
            "Loop over `schema.get(\"required\", [])` and test `if key not in block.input`. `.get` matters because `no_argument_tool` has no `required` entry.",
            "For the third rule, loop over `block.input` (its keys) and test `if key not in schema[\"properties\"]`.",
        ],
        "concepts": ["contract", "required", "block.input", "reading a definition"],
        "author_notes": NOTE,
    },
    {
        "id": "3P-E",
        "title": "Connect each declared tool to its function",
        "module": "3",
        "priority": "P0",
        "mode": "write",
        "fixtures": ["declared_tools_and_functions", "sdk_no_argument_request"],
        "lesson": [
            "A definition in `tools` only tells Claude that a tool exists. It does not create a Python function, and nothing checks that the two agree. Connecting a requested name to the right function, with the right arguments, is your code's job.",
            "Here `read_balance` is declared with no arguments, so its function is called as `read_balance()`. `check_temperature` declares `sensor_id`, so its function is given `block.input[\"sensor_id\"]`. `open_door` is declared but has no function at all.",
        ],
        "task": "Create a list `results`. For each tool_use block, call the Python function matching its name with exactly the arguments its definition declares, and append what it returns. For any tool name that has no function here, append `{\"error\": \"no function for <name>\"}`. Print `results` once, after the loop.",
        "starter": "results = []\nfor block in response.content:\n    if block.type == \"tool_use\":\n        # read_balance takes no arguments; check_temperature takes sensor_id\n        pass\n\nprint(results)",
        "tests": [
            "results is ['+ 2.1319 g', {temperature reading}] for the default request",
            "read_balance is called with no arguments",
            "a request for open_door gives an error entry and runs nothing",
            "each function runs only when requested",
        ],
        "hints": [
            "Branch on `block.name`, as in a dispatcher: `if block.name == \"read_balance\": results.append(read_balance())`.",
            "`check_temperature` needs `block.input[\"sensor_id\"]`. Do not read a key from `block.input` for `read_balance`: its input is `{}`.",
            "Finish with `else: results.append({\"error\": \"no function for \" + block.name})`.",
        ],
        "concepts": ["dispatch", "definition vs implementation", "function signature"],
        "author_notes": NOTE,
    },
    {
        "id": "3P-F",
        "title": "Find the mismatches",
        "module": "3",
        "priority": "P0",
        "mode": "debug",
        "fixtures": ["sdk_balance_only", "simulated_instruments"],
        "lesson": [
            "Three things must agree: the definition you give Claude, the request Claude sends back, and the Python that handles it. When they disagree, some mistakes crash loudly and others silently do nothing.",
            "Claude followed the `properties` in the definition below, so its request is `read_balance` with `{\"balance_id\": \"XPR205\"}`. Treat that request as correct and make the other two agree with it.",
        ],
        "task": "This program has three mismatches between the definition, Claude's request and the Python. Run it first and notice that it prints `[]` without any error. Fix all three so that `results` holds the balance reading and the definition's `required` list names an argument that really is declared. Do not type the ID yourself.",
        "starter": "tools = [\n    {\n        \"name\": \"read_balance\",\n        \"description\": \"Read a laboratory balance by its ID.\",\n        \"input_schema\": {\n            \"type\": \"object\",\n            \"properties\": {\"balance_id\": {\"type\": \"string\"}},\n            \"required\": [\"balanceId\"],\n        },\n    }\n]\n\nresults = []\nfor block in response.content:\n    if block.type == \"tool_use\":\n        if block.name == \"readBalance\":\n            results.append(read_balance(block.input[\"id\"]))\n\nprint(results)",
        "tests": [
            "results holds the balance reading for XPR205",
            "every name in required is declared in properties",
            "the declared tool name still matches what Claude asked for",
            "the ID comes from block.input",
            "nothing runs for a different tool",
        ],
        "hints": [
            "Why is nothing appended? Compare the name the code tests for with `block.name`. Add `print(block.name)` to see it.",
            "After that fix you will get a KeyError. Print `block.input` and compare its key with the one the code reads.",
            "Now look at `required`. The name there must be spelled exactly as the key under `properties`.",
        ],
        "concepts": ["debugging", "contract", "silent failure", "KeyError"],
        "author_notes": NOTE,
    },
]

manifest["fixtures"].update(FIXTURES)
new_ids = {e["id"] for e in EXERCISES}
kept = [e for e in manifest["exercises"] if e["id"] not in new_ids]
at = next(i for i, e in enumerate(kept) if e["id"] == "3A")
manifest["exercises"] = kept[:at] + EXERCISES + kept[at:]
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(len(manifest["exercises"]), "exercises")
