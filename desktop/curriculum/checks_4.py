"""Module 4: tool results and conversation history."""
from labcheck import (
    Fail, balance, checks, need, no_crash, parse_json_content, plain, same_content, sdk_message, temperature, text, tool, with_response,
)

BOTH = [text("I'll check the instruments."), tool("toolu_1", "read_balance", {"balance_id": "XPR205"}), tool("toolu_2", "check_temperature", {"sensor_id": "TEMP02"})]
FIRST_USER = {"role": "user", "content": "Read the balance and temperature."}


def result_block(value, label="The tool result"):
    value = plain(value)
    need(isinstance(value, dict), f"{label} should be a dictionary, but it is {type(value).__name__}.")
    need(value.get("type") == "tool_result", f"{label} needs \"type\": \"tool_result\"; its type is {value.get('type')!r}.")
    need("tool_use_id" in value, f"{label} needs a \"tool_use_id\" that names the request it answers.")
    return value


def expect_result(value, tool_id, payload, label="The tool result"):
    block = result_block(value, label)
    need(block["tool_use_id"] == tool_id, f"{label} has tool_use_id {block['tool_use_id']!r}; it should be the id of the request it answers ({tool_id!r}). Use the block's own id.")
    got = parse_json_content(block)
    need(got == payload, f"{label} content decodes to {got!r}; expected what the tool returned: {payload!r}.")


def history(run):
    no_crash(run)
    messages = run.get("messages", "the history list")
    need(isinstance(messages, list), "`messages` should still be a list.")
    for m in messages:
        need(isinstance(m, dict) and "role" in m and "content" in m, f"Every history entry needs \"role\" and \"content\"; got {str(plain(m))[:120]}.")
    return messages


def roles(messages):
    return [m["role"] for m in messages]


def expect_roles(messages, expected):
    need(roles(messages) == expected, f"The roles in the history are {roles(messages)}; expected {expected}.")


def expect_assistant_turn(message, response, label="The assistant message"):
    need(message["role"] == "assistant", f"{label} should have role \"assistant\"; it has {message['role']!r}.")
    content = message["content"]
    need(isinstance(content, list), f"{label} content should be the whole list `response.content`, but it is {type(content).__name__}.")
    need(same_content(content, response.content), f"{label} content has {len(content)} block(s) and does not match the full `response.content` ({len(response.content)} block(s)). Keep every block, unchanged.")


def user_results(message, label="The tool-result message"):
    need(message["role"] == "user", f"{label} should have role \"user\": tool results are sent back by your side of the conversation. It has {message['role']!r}.")
    content = message["content"]
    need(isinstance(content, list), f"{label} content should be a list of tool_result blocks, but it is {type(content).__name__}.")
    return content


@checks("4A")
def _(c):
    def default(run):
        no_crash(run)
        expect_result(run.get("tool_result", "a dictionary"), "toolu_bal", balance(), "`tool_result`")
        need(run.called("read_balance") == 1, f"`read_balance` was called {run.called('read_balance')} time(s); expected once.")

    c.visible("`tool_result` answers the balance request with the tool's output as JSON", default)

    def printed(run):
        no_crash(run)
        need(any("tool_result" in line for line in run.lines()), "Print `tool_result` so you can inspect it.")

    c.visible("`tool_result` is printed", printed)

    def other(run):
        no_crash(run)
        expect_result(run.get("tool_result", "a dictionary"), "toolu_q7", balance("AB104"), "With a different request, `tool_result`")

    c.hidden("A request with a different id and balance", other, with_response([tool("toolu_q7", "read_balance", {"balance_id": "AB104"})]), "tool_use_id comes from block.id; the argument from block.input")

    def after_text(run):
        no_crash(run)
        expect_result(run.get("tool_result", "a dictionary"), "toolu_bal", balance(), "With a text block first, `tool_result`")

    c.hidden("A text block comes before the request", after_text, with_response([text("Reading the balance."), tool("toolu_bal", "read_balance", {"balance_id": "XPR205"})]), "Only tool_use blocks have an id and input")


@checks("4B")
def _(c):
    def results(run):
        no_crash(run)
        value = run.get("tool_results", "a list")
        need(isinstance(value, list), f"`tool_results` should be a list, but it is {type(value).__name__}.")
        return value

    def default(run):
        got = results(run)
        need(len(got) == 2, f"`tool_results` has {len(got)} item(s); expected one per tool request (2). Append each result; do not overwrite the list.")
        expect_result(got[0], "toolu_1", balance(), "The first result")
        expect_result(got[1], "toolu_2", temperature(), "The second result")

    c.visible("Two tool_result blocks with matching ids, in request order", default)

    def printed(run):
        results(run)
        need(any("tool_result" in line for line in run.lines()), "Print the `tool_results` list.")

    c.visible("The list is printed", printed)

    def other(run):
        got = results(run)
        need(len(got) == 2, f"With different requests, `tool_results` has {len(got)} item(s); expected 2.")
        expect_result(got[0], "toolu_t5", temperature("TEMP05"), "The first result")
        expect_result(got[1], "toolu_b3", balance("AB104"), "The second result")

    c.hidden("Different ids, in the other order", other, with_response([tool("toolu_t5", "check_temperature", {"sensor_id": "TEMP05"}), text("and"), tool("toolu_b3", "read_balance", {"balance_id": "AB104"})]), "Each result carries its own block.id")

    def three(run):
        got = results(run)
        need(len(got) == 3, f"With three tool requests, `tool_results` has {len(got)} item(s); every request needs its own result.")
        need([plain(r).get("tool_use_id") for r in got] == ["toolu_a", "toolu_b", "toolu_c"], "With three requests, the result ids should be the three request ids in order.")

    c.hidden("Three tool requests in one response", three, with_response([tool("toolu_a", "read_balance", {"balance_id": "XPR205"}), tool("toolu_b", "read_balance", {"balance_id": "AB104"}), tool("toolu_c", "check_temperature", {"sensor_id": "TEMP02"})]), "One result for every tool_use block")

    def text_only(run):
        need(results(run) == [], "With no tool requests, `tool_results` should stay empty.")

    c.hidden("A response with only text", text_only, with_response([text("Nothing to do.")], "end_turn"), "Text blocks get no tool_result")


@checks("4C")
def _(c):
    def default(run):
        messages = history(run)
        need(len(messages) == 2, f"The history has {len(messages)} message(s); it should grow by exactly one (to 2).")
        need(plain(messages[0]) == FIRST_USER, "The original user message should be left as it was.")
        expect_assistant_turn(messages[-1], run.ns["response"])

    c.visible("One assistant message holding the full response.content is appended", default)

    def printed(run):
        history(run)
        need(run.lines() == ["assistant", "1"], f"Expected the output `assistant` then `1` (the role, then the number of content blocks); got {run.lines()}.")

    c.visible("The role and the number of content blocks are printed", printed)

    def three_blocks(run):
        messages = history(run)
        need(len(messages) == 2, f"The history has {len(messages)} message(s); expected 2.")
        expect_assistant_turn(messages[-1], run.ns["response"], "With a three-block response, the assistant message")
        need(run.lines() == ["assistant", "3"], f"With a three-block response the output should be `assistant` then `3`; got {run.lines()}.")

    c.hidden("A response with text and two tool requests", three_blocks, with_response(BOTH), "Append the whole content list, not one block of it")

    def ids_kept(run):
        messages = history(run)
        expect_assistant_turn(messages[-1], run.ns["response"])
        ids = [plain(b).get("id") for b in messages[-1]["content"]]
        need(ids == ["toolu_z1"], f"The tool request id in the history is {ids}; it must stay exactly as Claude sent it (toolu_z1).")

    c.hidden("The request id is preserved", ids_kept, with_response([tool("toolu_z1", "read_balance", {"balance_id": "XPR205"})]), "Content blocks go back unchanged")


@checks("4D")
def _(c):
    def default(run):
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        need(plain(messages[0]) == FIRST_USER, "The original user message should be left as it was.")
        expect_assistant_turn(messages[1], run.ns["response"])
        content = user_results(messages[2])
        need(len(content) == 1, f"The user message should contain one tool_result; it has {len(content)} block(s).")
        expect_result(content[0], "toolu_bal", balance())

    c.visible("History is user, assistant (request), user (one matching tool_result)", default)

    def once(run):
        history(run)
        need(run.called("read_balance") == 1, f"`read_balance` was called {run.called('read_balance')} time(s); the tool should run once.")

    c.hidden("The tool is executed once", once, concept="Run the tool, keep its result, reuse it")

    def other(run):
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        expect_assistant_turn(messages[1], run.ns["response"])
        expect_result(user_results(messages[2])[0], "toolu_m4", balance("AB104"), "With a different request, the tool result")

    c.hidden("A request with a different id and balance", other, with_response([tool("toolu_m4", "read_balance", {"balance_id": "AB104"})]), "tool_use_id must equal the request's block.id")

    def with_text(run):
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        expect_assistant_turn(messages[1], run.ns["response"], "With a text block in the response, the assistant message")
        content = user_results(messages[2])
        need(plain(content[0]).get("type") == "tool_result", "The user message content should begin with the tool_result block.")
        expect_result(content[0], "toolu_bal", balance())

    c.hidden("The response also contains a text block", with_text, with_response([text("Reading the balance."), tool("toolu_bal", "read_balance", {"balance_id": "XPR205"})]), "The assistant turn keeps every block; only tool_use blocks get results")


@checks("4E")
def _(c):
    def default(run):
        messages = history(run)
        need(len(messages) == 3, f"The history has {len(messages)} message(s); expected 3 (the question, Claude's request, one message with both results). Separate user messages for each result are not allowed.")
        expect_roles(messages, ["user", "assistant", "user"])
        expect_assistant_turn(messages[1], run.ns["response"])
        content = user_results(messages[2])
        need(len(content) == 2, f"The final user message has {len(content)} block(s); expected both tool results together.")
        expect_result(content[0], "toolu_1", balance(), "The first result")
        expect_result(content[1], "toolu_2", temperature(), "The second result")

    c.visible("Three messages; the last holds both tool results", default)

    def printed(run):
        history(run)
        need(run.lines() == ["3", "2"], f"Expected the output `3` then `2` (messages, then blocks in the final message); got {run.lines()}.")

    c.visible("The two counts are printed", printed)

    def three(run):
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        content = user_results(messages[2])
        need([plain(b).get("tool_use_id") for b in content] == ["toolu_a", "toolu_b", "toolu_c"], f"With three requests, the final message should hold three results with the request ids in order; got {[plain(b).get('tool_use_id') for b in content]}.")
        need(all(plain(b).get("type") == "tool_result" for b in content), "Only tool_result blocks belong in that message; no text before the results.")

    c.hidden("Three tool requests in one response", three, with_response([tool("toolu_a", "read_balance", {"balance_id": "XPR205"}), text("and"), tool("toolu_b", "check_temperature", {"sensor_id": "TEMP02"}), tool("toolu_c", "read_balance", {"balance_id": "AB104"})]), "All results of one turn travel in one user message")


@checks("4F")
def _(c):
    def tool_history(tool_id="toolu_bal", role="user", block_type="tool_result"):
        return [
            dict(FIRST_USER),
            {"role": "assistant", "content": [tool("toolu_bal", "read_balance", {"balance_id": "XPR205"})]},
            {"role": role, "content": [{"type": block_type, "tool_use_id": tool_id, "content": "{}"}]},
        ]

    def default(run):
        no_crash(run)
        need(run.lines() and run.lines()[-1] == "received", f"Building the history and printing `send(messages)` should print `received`; the output was {run.lines()}.")
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        expect_result(user_results(messages[2])[0], "toolu_bal", balance())

    c.visible("Your history is accepted by your own send()", default)

    def accepts(run):
        no_crash(run)
        need(run.call("send", tool_history()) == "received", "`send` should return \"received\" for a history whose last message is a user tool_result for toolu_bal.")

    c.hidden("send() accepts a valid history", accepts, concept="Validate the last message's role, block type and id")

    def rejects(label, **kwargs):
        def check(run):
            no_crash(run)
            got = run.call("send", tool_history(**kwargs))
            need(got == "rejected", f"`send` returned {got!r} for a history with {label}; it should return \"rejected\".")

        return check

    c.hidden("send() rejects the wrong role", rejects("the tool result in an assistant message", role="assistant"), concept="Tool results come back in a user message")
    c.hidden("send() rejects a different id", rejects("a tool_use_id that does not match the request", tool_id="toolu_other"), concept="The id must match the request")

    def missing_id(run):
        no_crash(run)
        messages = tool_history()
        del messages[2]["content"][0]["tool_use_id"]
        got = run.call("send", messages)
        need(got == "rejected", f"`send` returned {got!r} for a tool_result with no tool_use_id; it should return \"rejected\" rather than crash or accept.")

    c.hidden("send() rejects a result with no id", missing_id, concept="Use .get() when a key may be absent")

    def plain_text(run):
        no_crash(run)
        got = run.call("send", [dict(FIRST_USER)])
        need(got == "rejected", f"`send` returned {got!r} for a history that ends with an ordinary text message; it should return \"rejected\".")

    c.hidden("send() rejects a history with no tool result", plain_text, concept="Content can be a string, not always a list of blocks")


@checks("4G")
def _(c):
    def default(run):
        messages = history(run)
        need(len(messages) == 3, f"The history has {len(messages)} message(s); expected 3 with no duplicates.")
        expect_roles(messages, ["user", "assistant", "user"])
        need(plain(messages[0]) == FIRST_USER, "The original user message should stay first.")
        expect_assistant_turn(messages[1], run.ns["response"])
        block = result_block(user_results(messages[2])[0])
        need(block["tool_use_id"] == "toolu_bal", f"The tool result id is {block['tool_use_id']!r}; it should stay toolu_bal.")

    c.visible("Order is user, assistant request, user result", default)

    def with_text(run):
        messages = history(run)
        expect_roles(messages, ["user", "assistant", "user"])
        expect_assistant_turn(messages[1], run.ns["response"], "With a text block in the response, the assistant message")

    c.hidden("The full assistant response is preserved", with_text, with_response([text("Reading the balance."), tool("toolu_bal", "read_balance", {"balance_id": "XPR205"})]), "Reorder; do not trim the content")


@checks("4H")
def _(c):
    def results_for(ids):
        return [{"type": "tool_result", "tool_use_id": i, "content": "{}"} for i in ids]

    def default(run):
        no_crash(run)
        messages = [dict(FIRST_USER)]
        response = run.ns["response"]
        returned = run.call("record_tool_turn", messages, response, results_for(["toolu_1", "toolu_2"]))
        need(returned is messages, "`record_tool_turn` should return the same `messages` list it was given (after appending to it), not a new list or None.")
        need(len(messages) == 3, f"After one call the history has {len(messages)} message(s); it should grow by exactly 2.")
        expect_roles(messages, ["user", "assistant", "user"])
        expect_assistant_turn(messages[1], response)
        content = user_results(messages[2])
        need([plain(b).get("tool_use_id") for b in content] == ["toolu_1", "toolu_2"], "The user message should hold the whole `tool_results` list, kept together.")

    c.visible("One call appends the assistant turn and one user results message", default)

    def twice(run):
        no_crash(run)
        messages = [dict(FIRST_USER)]
        first = run.ns["response"]
        second = sdk_message([tool("toolu_9", "read_balance", {"balance_id": "AB104"})])
        run.call("record_tool_turn", messages, first, results_for(["toolu_1", "toolu_2"]))
        run.call("record_tool_turn", messages, second, results_for(["toolu_9"]))
        need(len(messages) == 5, f"After two calls the history has {len(messages)} message(s); expected 5. Earlier turns must not be replaced.")
        expect_roles(messages, ["user", "assistant", "user", "assistant", "user"])
        expect_assistant_turn(messages[1], first, "The first assistant turn")
        expect_assistant_turn(messages[3], second, "The second assistant turn")
        need([plain(b).get("tool_use_id") for b in messages[4]["content"]] == ["toolu_9"], "The second results message should hold the second call's results.")

    c.hidden("A second call adds two more messages", twice, concept="append mutates the same list; never rebuild the history")

    def longer(run):
        no_crash(run)
        messages = [dict(FIRST_USER), {"role": "assistant", "content": "Sure."}, {"role": "user", "content": "Go on."}]
        run.call("record_tool_turn", messages, run.ns["response"], results_for(["toolu_1", "toolu_2"]))
        need(len(messages) == 5 and plain(messages[1]) == {"role": "assistant", "content": "Sure."}, "Existing history of any length must be kept; the two new messages go at the end.")

    c.hidden("An existing longer history", longer, concept="Do not assume the history starts with one message")
