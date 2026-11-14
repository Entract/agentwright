"""Module 2: data structures and SDK objects."""
from labcheck import checks, expect_lines, need, no_crash, sdk_message, text, tool, with_response, with_values

BALANCE_TOOL = tool("toolu_1", "read_balance", {"balance_id": "XPR205"})
TEMP_TOOL = tool("toolu_2", "check_temperature", {"sensor_id": "TEMP02"})
TEXT = text("I'll check the instruments.")


def with_dict(blocks):
    return with_values(response={"content": blocks})


@checks("2A")
def _(c):
    c.visible("XPR205 is printed", lambda run: expect_lines(run, ["XPR205"]))
    c.hidden(
        "The same position holds a different balance",
        lambda run: expect_lines(run, ["AB104"], "With a different balance ID in the response, the output"),
        with_dict([TEXT, tool("toolu_1", "read_balance", {"balance_id": "AB104"}), TEMP_TOOL]),
        "Read the value out of the nested dictionary instead of typing it",
    )


@checks("2B")
def _(c):
    c.visible("The two tool names are printed, in order", lambda run: expect_lines(run, ["read_balance", "check_temperature"]))
    c.hidden("The blocks are in a different order", lambda run: expect_lines(run, ["check_temperature", "read_balance"], "With the blocks reordered, the output"), with_dict([TEMP_TOOL, TEXT, BALANCE_TOOL]), "Filter by type; do not rely on positions")
    c.hidden("Only text blocks", lambda run: expect_lines(run, [], "With only text blocks, the output"), with_dict([TEXT, text("Nothing else.")]), "A text block has no \"name\" key")
    c.hidden("Three tool requests", lambda run: expect_lines(run, ["read_balance", "read_balance", "check_temperature"], "With three tool blocks, the output"), with_dict([BALANCE_TOOL, tool("toolu_3", "read_balance", {"balance_id": "AB104"}), TEMP_TOOL]), "The loop handles however many blocks there are")


@checks("2C")
def _(c):
    c.visible("The two tool names are printed, in order", lambda run: expect_lines(run, ["read_balance", "check_temperature"]))
    c.hidden("The blocks are in a different order", lambda run: expect_lines(run, ["check_temperature", "read_balance"], "With the blocks reordered, the output"), with_response([TEMP_TOOL, TEXT, BALANCE_TOOL]), "block.type and block.name are attributes on SDK objects")
    c.hidden("Only a text block", lambda run: expect_lines(run, [], "With only a text block, the output"), with_response([TEXT], "end_turn"), "A TextBlock has no .name")


@checks("2D")
def _(c):
    c.visible("The balance ID from the read_balance request is printed", lambda run: expect_lines(run, ["XPR205"]))
    c.hidden("The requests are in a different order", lambda run: expect_lines(run, ["XPR205"], "With the temperature request first, the output"), with_response([TEMP_TOOL, TEXT, BALANCE_TOOL]), "Check block.name before reading balance_id: the temperature tool has no such key")
    c.hidden("A different balance ID", lambda run: expect_lines(run, ["AB104"], "With a different balance ID in the request, the output"), with_response([TEXT, tool("toolu_5", "read_balance", {"balance_id": "AB104"})]), "The value comes from block.input")
    c.hidden("No read_balance request", lambda run: expect_lines(run, [], "With only a temperature request, the output"), with_response([TEMP_TOOL]), "Other tools are ignored")


@checks("2E")
def _(c):
    def block(tool_input):
        return sdk_message([tool("toolu_x", "read_balance", tool_input)]).content[0]

    c.visible("The default unit g is printed for the fixture", lambda run: expect_lines(run, ["g"]))

    def default_unit(run):
        no_crash(run)
        got = run.call("unit_for", block({"balance_id": "XPR205"}))
        need(got == "g", f"`unit_for` returned {got!r} for a request with no unit; expected the default \"g\".")

    c.hidden("A request with no unit", default_unit, concept=".get(key, default) supplies a fallback")

    def given_unit(run):
        no_crash(run)
        got = run.call("unit_for", block({"balance_id": "XPR205", "unit": "mg"}))
        need(got == "mg", f"`unit_for` returned {got!r} for a request with unit \"mg\"; expected \"mg\".")

    c.hidden("A request that names a unit", given_unit, concept="The default applies only when the key is absent")

    def no_mutation(run):
        no_crash(run)
        b = block({"balance_id": "XPR205"})
        run.call("unit_for", b)
        need(b.input == {"balance_id": "XPR205"}, f"`unit_for` changed the block's input to {b.input!r}; reading a default should not add the key.")

    c.hidden("The request is left unchanged", no_mutation, concept="Read a value without writing it back")


@checks("2F")
def _(c):
    c.visible("One summary line per tool request", lambda run: expect_lines(run, ["read_balance:XPR205", "check_temperature:TEMP02"]))
    c.hidden("The requests are in a different order", lambda run: expect_lines(run, ["check_temperature:TEMP09", "read_balance:AB104"], "With the requests reordered, the output"), with_response([tool("toolu_a", "check_temperature", {"sensor_id": "TEMP09"}), TEXT, tool("toolu_b", "read_balance", {"balance_id": "AB104"})]), "Choose the input key from block.name")
    c.hidden("Only one kind of request", lambda run: expect_lines(run, ["check_temperature:TEMP02"], "With only a temperature request, the output"), with_response([TEMP_TOOL]), "Never read a key the request does not have")


@checks("2G")
def _(c):
    c.visible("needs_tools is printed for the tool_use response", lambda run: expect_lines(run, ["needs_tools"]))
    c.hidden("A response that ended normally", lambda run: expect_lines(run, ["finished"], "With stop_reason end_turn, the output"), with_response([text("All done.")], "end_turn"), "stop_reason is an attribute of the Message")
    c.hidden("A response cut off by the token limit", lambda run: expect_lines(run, ["finished"], "With stop_reason max_tokens, the output"), with_response([text("The reading is")], "max_tokens"), "Anything other than tool_use takes the other branch")
