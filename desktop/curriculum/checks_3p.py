"""Preparation for module 3 (3P-A..3P-F): who defines what in tool use.

These six exercises were added to the pack's 58. They teach the tool definition before 3A asks
the learner to act on a request that the definition shapes.
"""
import json

from labcheck import Fail, balance, checks, expect_lines, need, no_crash, sdk_message, temperature, text, tool, with_response

BALANCE_TOOL = {
    "name": "read_balance",
    "description": "Read mass from a simulated balance",
    "input_schema": {"type": "object", "properties": {"balance_id": {"type": "string"}}, "required": ["balance_id"]},
}
TEMPERATURE_TOOL = {
    "name": "check_temperature",
    "description": "Read temperature from a simulated sensor",
    "input_schema": {"type": "object", "properties": {"sensor_id": {"type": "string"}}, "required": ["sensor_id"]},
}
NO_ARGUMENT_TOOL = {
    "name": "read_balance",
    "description": "Reads the mass on the lab balance and returns it, for example '+ 2.1319 g'.",
    "input_schema": {"type": "object", "properties": {}},
}
ID_TOOL = {
    "name": "read_balance",
    "description": "Read a laboratory balance by its ID.",
    "input_schema": {
        "type": "object",
        "properties": {"balance_id": {"type": "string"}, "unit": {"type": "string", "enum": ["g", "mg"]}},
        "required": ["balance_id"],
    },
}
# Keys other tool-calling formats use, which this API does not.
FOREIGN_KEYS = {"parameters": "input_schema", "schema": "input_schema", "inputs": "input_schema", "args": "input_schema", "function": "name", "title": "name"}


def request(name, tool_input, tool_id="toolu_case"):
    """One tool_use block, as the SDK would hand it over."""
    return sdk_message([tool(tool_id, name, tool_input)]).content[0]


def one_definition(run):
    """The single tool definition the learner wrote in `tools`, after basic shape checks."""
    no_crash(run)
    tools = run.get("tools", "a list")
    need(isinstance(tools, list), f"`tools` should be a list of definitions, but it is {type(tools).__name__}. Wrap the dictionary in [ ].")
    need(len(tools) == 1, f"`tools` should hold exactly one definition here; it holds {len(tools)}.")
    definition = tools[0]
    need(isinstance(definition, dict), f"The definition should be a dictionary, but it is {type(definition).__name__}.")
    for wrong, right in FOREIGN_KEYS.items():
        need(wrong not in definition, f"The definition has a key \"{wrong}\". Claude's API calls this \"{right}\".")
    for key in ("name", "description", "input_schema"):
        need(key in definition, f"The definition has no \"{key}\" key. It needs \"name\", \"description\" and \"input_schema\".")
    return definition


def schema_of(definition):
    schema = definition["input_schema"]
    need(isinstance(schema, dict), f"\"input_schema\" should be a dictionary, but it is {type(schema).__name__}.")
    need(schema.get("type") == "object", f"\"input_schema\" needs \"type\": \"object\" (the arguments arrive together as one dictionary); found {schema.get('type')!r}.")
    need("properties" in schema, "\"input_schema\" needs a \"properties\" key, even when it is empty.")
    need(isinstance(schema["properties"], dict), f"\"properties\" should be a dictionary of argument names, but it is {type(schema['properties']).__name__}.")
    return schema


def plain_data(run):
    definition = one_definition(run)
    try:
        json.dumps(definition)
    except (TypeError, ValueError) as exc:
        raise Fail(f"The definition cannot be sent as JSON ({exc}). Types are written as strings such as \"string\" and \"object\", not as Python's str or dict.") from None


# --------------------------------------------------------------------------- 3P-A

@checks("3P-A")
def _(c):
    c.options(explanation=[
        {"point": "Says what Anthropic defines (the format of the messages and blocks)", "any": [["anthropic", "format"], ["anthropic", "protocol"], ["anthropic", "structure"], ["anthropic", "shape"], ["anthropic", "block"], ["anthropic", "tool_use"], ["anthropic", "envelope"]]},
        {"point": "Says what the developer defines (tool names, descriptions, arguments, the Python)", "any": [["developer"], ["i defin"], ["i wr"], ["i cho"], ["i decl"], ["i decide"], ["my "], ["we "], ["you "]]},
        {"point": "Says what Claude decides (which tool to ask for and the argument values)", "any": [["claude", "which"], ["claude", "cho"], ["claude", "decid"], ["claude", "value"], ["claude", "fill"], ["claude", "whether"], ["claude", "pick"], ["claude", "select"]]},
    ])

    def values(run, name, keys):
        no_crash(run)
        for variable in ("declared_name", "declared_keys", "requested_name", "requested_keys"):
            need(run.get(variable) is not None, f"`{variable}` is still None. Read it from `definition` or `request`.")
        need(run.ns["declared_name"] == name, f"`declared_name` is {run.ns['declared_name']!r}; the definition's \"name\" is {name!r}.")
        need(run.ns["requested_name"] == name, f"`requested_name` is {run.ns['requested_name']!r}; the request's name is {name!r}. The request is an object: request.name.")
        for variable in ("declared_keys", "requested_keys"):
            got = run.ns[variable]
            need(not isinstance(got, (str, dict)), f"`{variable}` should be a list of argument names, but it is {type(got).__name__}: {got!r}. Use list(...) on the dictionary.")
        need(list(run.ns["declared_keys"]) == keys, f"`declared_keys` is {list(run.ns['declared_keys'])}; the keys under \"properties\" are {keys}.")

    def default(run):
        values(run, "read_balance", ["balance_id"])
        need(list(run.ns["requested_keys"]) == ["balance_id"], f"`requested_keys` is {list(run.ns['requested_keys'])}; the keys of request.input are ['balance_id'].")
        expect_lines(run, ["True", "True"])

    c.visible("The four values are read out and both comparisons print True", default)

    def other_tool(run):
        values(run, "check_temperature", ["sensor_id"])
        expect_lines(run, ["True", "True"], "With a different tool, the output")

    def temperature_pair(ns):
        ns["tools"] = [TEMPERATURE_TOOL]
        ns["response"] = sdk_message([text("Checking."), tool("toolu_t", "check_temperature", {"sensor_id": "TEMP02"})])

    c.hidden("A different definition and request", other_tool, temperature_pair, "The values are read from the data, not typed in")

    def extra_key(run):
        values(run, "read_balance", ["balance_id"])
        need(list(run.ns["requested_keys"]) == ["balance_id", "unit"], f"`requested_keys` is {list(run.ns['requested_keys'])}; this request's input has the keys ['balance_id', 'unit'].")
        expect_lines(run, ["True", "False"], "When the request has a key the definition does not declare, the output")

    c.hidden("A request with a key the definition never declared", extra_key, with_response([tool("toolu_u", "read_balance", {"balance_id": "XPR205", "unit": "mg"})]), "A request can disagree with its definition; comparing them shows it")


# --------------------------------------------------------------------------- 3P-B

@checks("3P-B")
def _(c):
    def shape(run):
        definition = one_definition(run)
        need(definition["name"] == "read_balance", f"The tool's name is {definition['name']!r}; the task asks for \"read_balance\".")
        schema = schema_of(definition)
        need(schema["properties"] == {}, f"This tool takes no arguments, so \"properties\" should be empty; it declares {list(schema['properties'])}.")
        expect_lines(run, ["read_balance"])

    c.visible("One definition named read_balance, with an empty schema", shape)

    def described(run):
        description = one_definition(run)["description"]
        need(isinstance(description, str), f"\"description\" should be text, but it is {type(description).__name__}.")
        need(len(description.split()) >= 5, f"The description is {description!r}. Claude decides when to use a tool from this text alone, so say what the tool does or returns in at least five words.")

    c.visible("The description says what the tool does", described, concept="The description is the only thing that tells Claude when to use the tool")

    def nothing_required(run):
        required = schema_of(one_definition(run)).get("required", [])
        need(required == [], f"\"required\" lists {required!r}, but no arguments are declared. Leave \"required\" out.")

    c.hidden("Nothing is marked required", nothing_required, concept="required may only name declared arguments")

    c.hidden("The definition is plain data", plain_data, concept="A definition is sent to the API as JSON")


# --------------------------------------------------------------------------- 3P-C

@checks("3P-C")
def _(c):
    def properties_of(run):
        definition = one_definition(run)
        need(definition["name"] == "read_balance", f"The tool's name should stay \"read_balance\"; it is {definition['name']!r}.")
        schema = schema_of(definition)
        properties = schema["properties"]
        need(set(properties) == {"balance_id", "unit"}, f"\"properties\" declares {sorted(properties)}; the task asks for balance_id and unit.")
        for name, spec in properties.items():
            need(isinstance(spec, dict), f"The entry for \"{name}\" should be a dictionary such as {{\"type\": \"string\"}}, but it is {spec!r}.")
        return schema, properties

    def declared(run):
        _, properties = properties_of(run)
        for name in ("balance_id", "unit"):
            got = properties[name].get("type")
            need(got == "string", f"\"{name}\" should have \"type\": \"string\" (in quotes); found {got!r}.")

    c.visible("balance_id and unit are declared as strings", declared)

    def required(run):
        schema, _ = properties_of(run)
        need("required" in schema, "\"input_schema\" has no \"required\" list, so Claude may leave balance_id out. Add \"required\" beside \"properties\".")
        got = schema["required"]
        need(isinstance(got, list), f"\"required\" should be a list of names, but it is {type(got).__name__}: {got!r}.")
        need("unit" not in got, "\"unit\" is listed as required, but the task says it is optional.")
        need(got == ["balance_id"], f"\"required\" is {got}; it should be [\"balance_id\"].")

    c.visible("balance_id is required and unit is optional", required, concept="Anything not in required may be left out by Claude")

    def limited(run):
        _, properties = properties_of(run)
        got = properties["unit"].get("enum")
        need(got is not None, "\"unit\" accepts any string. Add \"enum\": [\"g\", \"mg\"] to limit it to those two.")
        need(isinstance(got, list) and sorted(got) == ["g", "mg"], f"The enum for \"unit\" is {got!r}; it should list \"g\" and \"mg\".")

    c.hidden("unit is limited to g and mg", limited, concept="enum lists the only values an argument may take")

    def described(run):
        _, properties = properties_of(run)
        for name in ("balance_id", "unit"):
            got = properties[name].get("description")
            need(isinstance(got, str) and len(got.split()) >= 2, f"\"{name}\" has no description (or a one-word one). A short phrase tells Claude what to put there.")

    c.hidden("Each argument has a description", described, concept="Argument descriptions guide what Claude sends")

    c.hidden("The definition is plain data", plain_data, concept="JSON Schema types are strings, not Python types")


# --------------------------------------------------------------------------- 3P-D

@checks("3P-D")
def _(c):
    def problems(run, definition, block, label):
        got = run.call("check_request", definition, block)
        need(isinstance(got, list), f"`check_request` should return a list of problems, but for {label} it returned {got!r}.")
        return got

    def expect(run, definition, block, expected, label):
        got = problems(run, definition, block, label)
        need(sorted(got) == sorted(expected), f"For {label}, `check_request` returned {got}; expected {expected}.")

    def default(run):
        no_crash(run)
        expect(run, ID_TOOL, request("read_balance", {"balance_id": "XPR205"}), [], "a request that fits its definition")
        expect(run, NO_ARGUMENT_TOOL, request("read_balance", {"balance_id": "XPR205"}), ["unexpected balance_id"], "the same request against the no-argument definition")
        expect_lines(run, ["[]", "['unexpected balance_id']"])

    c.visible("The request fits one definition and not the other", default)

    def missing(run):
        no_crash(run)
        expect(run, ID_TOOL, request("read_balance", {}), ["missing balance_id"], "a request without the required balance_id")

    c.visible("A missing required argument is reported", missing, concept="required names what Claude must always send")

    def optional(run):
        no_crash(run)
        expect(run, ID_TOOL, request("read_balance", {"balance_id": "AB104", "unit": "mg"}), [], "a request that includes the optional unit")
        expect(run, NO_ARGUMENT_TOOL, request("read_balance", {}), [], "an empty request against the no-argument definition")

    c.hidden("Optional arguments and a definition with no required list", optional, concept="Optional keys may be present or absent; use .get for a missing required list")

    def wrong_name(run):
        no_crash(run)
        got = problems(run, ID_TOOL, request("check_temperature", {"balance_id": "XPR205"}), "a request for a different tool")
        need("wrong tool" in got, f"For a request named check_temperature against the read_balance definition, expected \"wrong tool\" among the problems; got {got}.")

    c.hidden("A request for a different tool", wrong_name, concept="The name is part of the contract too")

    def several(run):
        no_crash(run)
        expect(run, ID_TOOL, request("read_balance", {"unit": "g", "scale": 1}), ["missing balance_id", "unexpected scale"], "a request with one key missing and one unexpected")

    c.hidden("One missing and one unexpected key together", several, concept="Check every key, not only the first")


# --------------------------------------------------------------------------- 3P-E

@checks("3P-E")
def _(c):
    def results_of(run):
        no_crash(run)
        results = run.get("results", "a list")
        need(isinstance(results, list), f"`results` should be a list, but it is {type(results).__name__}.")
        return results

    def default(run):
        results = results_of(run)
        need(results == ["+ 2.1319 g", temperature()], f"`results` is {results}; expected the balance reading '+ 2.1319 g' and then the temperature dictionary.")
        need(run.called("read_balance") == 1 and run.called("check_temperature") == 1, "Each requested function should run exactly once.")

    c.visible("Both requested tools run with the arguments they declare", default)

    def no_arguments(run):
        results_of(run)
        calls = run.calls.get("read_balance", [])
        need(len(calls) == 1, f"`read_balance` was called {len(calls)} time(s); expected once.")
        args, kwargs = calls[0]
        need(not args and not kwargs, f"`read_balance` was called with {args or kwargs}, but its definition declares no arguments.")

    c.visible("read_balance is called with no arguments", no_arguments, concept="The definition tells you what to pass")

    def no_function(run):
        results = results_of(run)
        need(results == [{"error": "no function for open_door"}], f"For a request for open_door, `results` is {results}; expected [{{'error': 'no function for open_door'}}].")
        need(run.called("read_balance") + run.called("check_temperature") == 0, "A request for open_door must not run any other instrument.")

    c.hidden("A declared tool that has no Python function", no_function, with_response([tool("toolu_d", "open_door", {})]), "A definition does not create a function")

    def other_sensor(run):
        results = results_of(run)
        need(results == [temperature("TEMP09")], f"With only a temperature request, `results` is {results}; expected the reading for TEMP09.")
        need(run.called("read_balance") == 0, "`read_balance` was not requested, so it should not run.")

    c.hidden("Only the temperature is requested, for another sensor", other_sensor, with_response([tool("toolu_9", "check_temperature", {"sensor_id": "TEMP09"})]), "Arguments come from block.input; functions run only when requested")

    def stray_argument(run):
        results = results_of(run)
        need(results == ["+ 2.1319 g"], f"When the request carries an argument that was never declared, `results` is {results}; read_balance still takes none, so expected ['+ 2.1319 g'].")

    c.hidden("A request that carries an undeclared argument", stray_argument, with_response([tool("toolu_s", "read_balance", {"balance_id": "XPR205"})]), "Your function takes what you wrote it to take, whatever arrives")

    def printed_once(run):
        results_of(run)
        need(len(run.lines()) == 1, f"Expected one printed line (the list, after the loop); {len(run.lines())} were printed.")

    c.hidden("The list is printed once", printed_once, concept="Collect, then print")


# --------------------------------------------------------------------------- 3P-F

@checks("3P-F")
def _(c):
    def results_of(run):
        no_crash(run)
        results = run.get("results", "a list")
        need(isinstance(results, list), f"`results` should be a list, but it is {type(results).__name__}.")
        return results

    def reading(run):
        results = results_of(run)
        need(results != [], "`results` is still empty and nothing crashed: the code never entered the branch that calls the instrument. Compare the name it tests for with block.name.")
        need(results == [balance()], f"`results` is {results}; expected the reading for XPR205.")
        need(run.called("read_balance") == 1, "`read_balance` should run exactly once.")

    c.visible("The balance request is carried out", reading)

    def schema_agrees(run):
        no_crash(run)
        tools = run.get("tools", "a list")
        need(isinstance(tools, list) and len(tools) == 1 and isinstance(tools[0], dict), "Keep `tools` as a list with the one definition.")
        need(tools[0].get("name") == "read_balance", f"The declared name is now {tools[0].get('name')!r}, but Claude asked for \"read_balance\". The request is the fixed point; make the Python agree with it.")
        schema = schema_of(tools[0])
        need("balance_id" in schema["properties"], f"\"properties\" now declares {list(schema['properties'])}, but Claude sent \"balance_id\". Keep that key and fix the others to match.")
        required = schema.get("required", [])
        stray = [name for name in required if name not in schema["properties"]]
        if stray:
            raise Fail(f"\"required\" names {stray}, which \"properties\" does not declare. The spelling must match exactly.")
        need(required == ["balance_id"], f"\"required\" is {required}; balance_id should still be required.")

    c.visible("The definition agrees with itself and with the request", schema_agrees, concept="required must name declared arguments")

    def other_id(run):
        results = results_of(run)
        need(results == [balance("AB104")], f"With a different ID in the request, `results` is {results}; the ID should come from block.input.")

    c.hidden("A different balance ID", other_id, with_response([tool("toolu_x", "read_balance", {"balance_id": "AB104"})]), "The ID comes from block.input")

    def other_tool(run):
        results = results_of(run)
        need(results == [], f"For a request for a different tool, `results` should stay empty; it is {results}.")
        need(run.called("read_balance") == 0, "`read_balance` must not run for a different tool.")

    c.hidden("A request for a different tool", other_tool, with_response([tool("toolu_t", "check_temperature", {"sensor_id": "TEMP02"})]), "Keep the name test; fix its spelling")
