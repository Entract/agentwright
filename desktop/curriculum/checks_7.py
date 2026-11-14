"""Module 7: read, debug and extend unfamiliar agents.

Where the manifest starter only describes the broken code ("given broken dispatcher from an
earlier lesson"), the app supplies that code as the editable starter, so there is something
concrete to read and fix.
"""
from checks_3 import calls_once, expect_printed
from checks_4 import FIRST_USER, expect_assistant_turn, expect_result, expect_roles, history, user_results
from labcheck import FIXTURES, balance, checks, expect_lines, need, no_crash, plain, printed_values, temperature, text, tool, uses_any, with_response, with_values

TEXT = text("I'll check the instruments.")
BALANCE_TOOL = tool("toolu_1", "read_balance", {"balance_id": "XPR205"})
TEMP_TOOL = tool("toolu_2", "check_temperature", {"sensor_id": "TEMP02"})


@checks("7A")
def _(c):
    def with_dict(blocks):
        return with_values(response={"content": blocks})

    c.visible("The two tool names are printed", lambda run: expect_lines(run, ["read_balance", "check_temperature"]))
    c.hidden("The blocks are in a different order", lambda run: expect_lines(run, ["check_temperature", "read_balance"], "With the blocks reordered, the output"), with_dict([TEMP_TOOL, TEXT, BALANCE_TOOL]), "A dictionary is read with square brackets")
    c.hidden("Only text blocks", lambda run: expect_lines(run, [], "With only text blocks, the output"), with_dict([TEXT]), "Filter on the block's type before reading its name")


@checks("7B")
def _(c):
    def expect(values, wanted, label):
        def check(run):
            no_crash(run)
            got = run.call("count_high", values)
            need(got == wanted, f"`count_high({values})` returned {got!r}; expected {wanted}. {label}")

        return check

    c.visible("The full count is returned for the measurements", expect([9.5, 10.2, 11.8, 12.4, 10.7, 11.5], 3, "Where does the function leave the loop?"))
    c.hidden("No value qualifies", expect([8, 10, 11], 0, ""), concept="The return after the loop handles the empty case")
    c.hidden("Every value qualifies", expect([12, 13, 14], 3, "A return inside the loop ends the function at the first match."), concept="return exits the whole function, not just the loop pass")


BROKEN_7C = '''# Given broken dispatcher from earlier lesson.
# Refactor function execution to happen in matching branches.
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            balance_id = block.input["balance_id"]
        elif block.name == "check_temperature":
            sensor_id = block.input["sensor_id"]

print(read_balance(balance_id))
print(check_temperature(sensor_id))
'''


@checks("7C")
def _(c):
    c.options(files={"main.py": BROKEN_7C}, note="In this app the broken dispatcher is already in the editor. It works when both tools are requested. Make it run only the tools that are requested, printing each result.")

    def both(run):
        expect_printed(run, [balance(), temperature()], "With both requests")
        calls_once(run, "read_balance")
        calls_once(run, "check_temperature")

    c.visible("Both requests still work, each tool once", both)

    def only_balance(run):
        expect_printed(run, [balance()], "With only a balance request")
        calls_once(run, "check_temperature", 0)

    c.visible("Only a balance request", only_balance, with_response([BALANCE_TOOL]), "A variable assigned inside an if may not exist later")

    def only_temperature(run):
        expect_printed(run, [temperature("TEMP09")], "With only a temperature request")
        calls_once(run, "read_balance", 0)

    c.hidden("Only a temperature request", only_temperature, with_response([tool("toolu_9", "check_temperature", {"sensor_id": "TEMP09"})]), "Call the function in the branch that matched")

    def text_only(run):
        no_crash(run)
        need(run.called("read_balance") + run.called("check_temperature") == 0, "With no tool requests, neither instrument should run.")

    c.hidden("A response with only text", text_only, with_response([TEXT], "end_turn"), "Nothing requested, nothing executed")

    def two_balances(run):
        expect_printed(run, [balance("XPR205"), balance("AB104")], "With two balance requests")

    c.hidden("Two requests for the same tool", two_balances, with_response([BALANCE_TOOL, tool("toolu_3", "read_balance", {"balance_id": "AB104"})]), "A stored variable keeps only the last request")


BROKEN_7D = '''import json
# One turn has IDs toolu_1 and toolu_2.
# Broken code reuses first ID for every result.
# Fix its result-building loop.
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
            "tool_use_id": response.content[1].id,
            "content": json.dumps(result),
        })

messages.append({"role": "user", "content": tool_results})
print(tool_results)
'''


@checks("7D")
def _(c):
    c.options(
        files={"main.py": BROKEN_7D},
        extra_fixtures={"simulated_instruments": FIXTURES["simulated_instruments"]},
        note="In this app the broken code is already in the editor, and the two simulated instruments are provided so that it runs.",
    )

    def default(run):
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        need(plain(messages[0]) == FIRST_USER, "The original user message should stay first.")
        expect_assistant_turn(messages[1], run.ns["response"])
        content = user_results(messages[2])
        need(len(content) == 2, f"The results message has {len(content)} block(s); expected 2.")
        expect_result(content[0], "toolu_1", balance(), "The first result")
        expect_result(content[1], "toolu_2", temperature(), "The second result")

    c.visible("Each result carries the id of its own request", default)

    other = [tool("toolu_t8", "check_temperature", {"sensor_id": "TEMP05"}), text("and"), tool("toolu_b4", "read_balance", {"balance_id": "AB104"})]

    def reordered(run):
        messages = history(run)
        content = user_results(messages[2])
        expect_result(content[0], "toolu_t8", temperature("TEMP05"), "With other ids, the first result")
        expect_result(content[1], "toolu_b4", balance("AB104"), "With other ids, the second result")

    c.hidden("Other ids, in another order", reordered, with_response(other), "The id is on the block being handled: block.id")

    three = [tool("toolu_a", "read_balance", {"balance_id": "XPR205"}), tool("toolu_b", "read_balance", {"balance_id": "AB104"}), tool("toolu_c", "check_temperature", {"sensor_id": "TEMP02"})]

    def unique(run):
        messages = history(run)
        ids = [plain(b).get("tool_use_id") for b in user_results(messages[2])]
        need(ids == ["toolu_a", "toolu_b", "toolu_c"], f"With three requests the result ids are {ids}; each must match its own request.")

    c.hidden("Three requests", unique, with_response(three), "No fixed index can be right for every block")


DUPLICATED_7E = '''# Existing program contains repeated validation/print logic.
# Extract a reusable helper while preserving results.
for block in response.content:
    if block.type == "tool_use":
        if block.name == "read_balance":
            if "balance_id" in block.input:
                balance_id = block.input["balance_id"]
                result = read_balance(balance_id)
                print(result)
            else:
                result = {"error": "missing balance_id"}
                print(result)
        elif block.name == "check_temperature":
            if "sensor_id" in block.input:
                sensor_id = block.input["sensor_id"]
                result = check_temperature(sensor_id)
                print(result)
            else:
                result = {"error": "missing sensor_id"}
                print(result)
        else:
            result = {"error": "unknown tool: " + block.name}
            print(result)
'''


def reference_7e(blocks):
    """What the original program prints, used as the behaviour to preserve."""
    out = []
    for b in blocks:
        if b["type"] != "tool_use":
            continue
        if b["name"] == "read_balance":
            out.append(balance(b["input"]["balance_id"]) if "balance_id" in b["input"] else {"error": "missing balance_id"})
        elif b["name"] == "check_temperature":
            out.append(temperature(b["input"]["sensor_id"]) if "sensor_id" in b["input"] else {"error": "missing sensor_id"})
        else:
            out.append({"error": "unknown tool: " + b["name"]})
    return out


@checks("7E")
def _(c):
    c.options(files={"main.py": DUPLICATED_7E}, note="In this app the existing program is already in the editor. Move the routing into `execute_tool(name, args)` and keep a short loop that prints exactly what the program prints now.")
    default_blocks = [TEXT, BALANCE_TOOL, TEMP_TOOL]

    def same_output(blocks, label):
        def check(run):
            no_crash(run)
            got = [v for v in printed_values(run)]
            need(got == reference_7e(blocks), f"{label}: the program printed {got}; before the refactor it printed {reference_7e(blocks)}. A refactor must not change behaviour.")

        return check

    c.visible("The output is the same as before the refactor", same_output(default_blocks, "With the two known tools"))

    def helper(run):
        no_crash(run)
        need(callable(run.ns.get("execute_tool")), "Define a function `execute_tool(name, args)` that does the routing.")
        need(run.called("execute_tool") == 2, f"`execute_tool` was called {run.called('execute_tool')} time(s) by your loop; expected once per tool request (2).")
        got = run.call("execute_tool", "read_balance", {"balance_id": "AB104"})
        need(got == balance("AB104"), f"`execute_tool(\"read_balance\", ...)` returned {got!r}; it should return the reading rather than print it.")
        got = run.call("execute_tool", "nonexistent", {})
        need(got == {"error": "unknown tool: nonexistent"}, f"`execute_tool` returned {got!r} for an unknown tool; the original program produced {{'error': 'unknown tool: nonexistent'}}.")

    c.visible("The routing lives in execute_tool, which returns its result", helper, concept="The loop iterates and prints; the helper decides and returns")

    mixed = [tool("toolu_a", "check_temperature", {}), tool("toolu_b", "open_door", {"door": 1}), text("then"), tool("toolu_c", "read_balance", {}), tool("toolu_d", "read_balance", {"balance_id": "AB104"})]
    c.hidden("Unknown tools and missing arguments, in order", same_output(mixed, "With unknown tools and missing arguments"), with_response(mixed), "Every branch of the old code must survive the move")

    def no_eval(run):
        no_crash(run)
        used = uses_any(run, {"eval", "exec", "globals", "locals", "getattr", "__import__"})
        need(not used, f"The refactor uses {', '.join(used)}. Keep explicit routing so that only known tools can run.")

    c.hidden("Only allowlisted functions can run", no_eval, concept="Shorter code must not become less safe")


COPY_7F = '''# Your editable copy of the agent shown on the left (unfamiliar_agent_readonly).
# First write your trace in the explanation box. Then fix the one intentional bug here.
def run(response):
    actions = []
    for block in response.content:
        if block.type == "tool_use":
            if block.name == "read_balance":
                actions.append(read_balance(block.input["balance_id"]))
                return actions
            elif block.name == "check_temperature":
                actions.append(check_temperature(block.input["sensor_id"]))
    return actions

print(run(response))
'''

NOTE_7F = (
    "In this app: before editing, write in the explanation box (1) what `run(response)` returns for the response on the left as the code stands, and why, "
    "and (2) which data structure changes and when. Then fix the bug in your copy in the editor. The explanation is assessed separately from the code."
)


@checks("7F")
def _(c):
    c.options(
        files={"main.py": COPY_7F},
        note=NOTE_7F,
        explanation=[
            {"point": "Says the function returns early, inside the loop", "any": [["return", "loop"], ["early"], ["exit"], ["stops"], ["leaves"]]},
            {"point": "Predicts that only the balance result comes back and the temperature tool never runs", "any": [["temperature", "not"], ["temperature", "never"], ["only", "balance"], ["one", "result"], ["skip"]]},
            {"point": "Names the list that changes (`actions`, appended to)", "any": [["actions"], ["append"], ["list"]]},
        ],
    )

    def expect(blocks, wanted, label):
        def check(run):
            no_crash(run)
            from labcheck import sdk_message

            got = run.call("run", sdk_message(blocks, "tool_use" if any(b["type"] == "tool_use" for b in blocks) else "end_turn"))
            need(got == wanted, f"{label}: `run(response)` returned {got!r}; expected {wanted!r}.")

        return check

    c.visible("Both requested tools run and both results are returned", expect([TEXT, BALANCE_TOOL, TEMP_TOOL], [balance(), temperature()], "With the response on the left"))
    c.hidden("The temperature request comes first", expect([TEMP_TOOL, BALANCE_TOOL], [temperature(), balance()], "With the requests in the other order"), concept="Trace one block at a time")
    c.hidden("Two balance requests", expect([BALANCE_TOOL, tool("toolu_3", "read_balance", {"balance_id": "AB104"})], [balance(), balance("AB104")], "With two balance requests"), concept="The early return dropped everything after the first balance")
    c.hidden("Only text", expect([TEXT], [], "With no tool requests"), concept="The loop may find nothing to do")
