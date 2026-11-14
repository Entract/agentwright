"""Module 5: complete agentic loops, driven by fake clients. Nothing here contacts the API."""
import json

from labcheck import Fail, balance, block_key, checks, need, no_crash, plain, sdk_message, temperature, text, tool, with_response

BALANCE_ONLY = [tool("toolu_bal", "read_balance", {"balance_id": "XPR205"})]
BOTH = [text("I'll check the instruments."), tool("toolu_1", "read_balance", {"balance_id": "XPR205"}), tool("toolu_2", "check_temperature", {"sensor_id": "TEMP02"})]
FINAL_TEXT = "The balance reads 10.52 g."

TOOL_OUTPUT = {"read_balance": lambda i: balance(i["balance_id"]), "check_temperature": lambda i: temperature(i["sensor_id"])}


def final(message="All readings checked."):
    return sdk_message([text(message)], "end_turn", "msg_final")


def scripted_client(responses, repeat_last=True):
    """A setup step that installs fake_client(messages), replying with `responses` in turn."""

    def setup(ns):
        calls = []

        def fake_client(messages):
            calls.append(list(messages))
            index = len(calls) - 1
            if index >= len(responses):
                need(repeat_last, "The fake client was called more times than the conversation needs.")
                index = len(responses) - 1
            return responses[index]

        ns["fake_client"] = fake_client
        ns["fake_client_calls"] = calls

    return setup


def both(*setups):
    def setup(ns):
        for step in setups:
            step(ns)

    return setup


def client_calls(run):
    """The message lists the fake client received, one per call."""
    return [args[0] if args else kwargs.get("messages") for args, kwargs in run.calls.get("fake_client", [])]


def expect_turn(messages, request_blocks, label):
    """`messages` must end with the assistant request followed by one user message answering every tool request."""
    need(isinstance(messages, list) and len(messages) >= 3, f"{label}: the fake client received {len(messages) if isinstance(messages, list) else 'no'} message(s); it needs the question, Claude's request and your results.")
    assistant, user = messages[-2], messages[-1]
    need(isinstance(assistant, dict) and assistant.get("role") == "assistant", f"{label}: the message before the results should be the assistant's request, but its role is {assistant.get('role') if isinstance(assistant, dict) else type(assistant).__name__!r}.")
    content = assistant.get("content")
    need(isinstance(content, list) and [block_key(b) for b in content] == [block_key(b) for b in request_blocks], f"{label}: the assistant message should hold Claude's full response content, unchanged ({len(request_blocks)} block(s)).")
    need(isinstance(user, dict) and user.get("role") == "user", f"{label}: the last message should be your user message with the tool results; its role is {user.get('role') if isinstance(user, dict) else '?'!r}.")
    results = user.get("content")
    need(isinstance(results, list), f"{label}: the results message content should be a list of tool_result blocks, but it is {type(results).__name__}.")
    wanted = [b for b in request_blocks if b["type"] == "tool_use"]
    got_ids = [plain(r).get("tool_use_id") for r in results]
    need(got_ids == [b["id"] for b in wanted], f"{label}: the result ids are {got_ids}; expected one result per tool request, in order: {[b['id'] for b in wanted]}.")
    for request, result in zip(wanted, results):
        result = plain(result)
        need(result.get("type") == "tool_result", f"{label}: each block in the results message needs \"type\": \"tool_result\".")
        content = result.get("content")
        need(isinstance(content, str), f"{label}: the tool_result content for {request['id']} should be a JSON string (json.dumps), but it is {type(content).__name__}.")
        try:
            decoded = json.loads(content)
        except ValueError:
            raise Fail(f"{label}: the tool_result content for {request['id']} is not valid JSON.") from None
        expected = TOOL_OUTPUT[request["name"]](request["input"])
        need(decoded == expected, f"{label}: the result for {request['id']} decodes to {decoded!r}; expected the tool's output {expected!r}.")


@checks("5A")
def _(c):
    def expect(stop_reason, wanted, label):
        def check(run):
            no_crash(run)
            got = run.call("needs_tool_execution", sdk_message([text("x")] if stop_reason != "tool_use" else BALANCE_ONLY, stop_reason))
            need(got is wanted, f"For a response with stop_reason {stop_reason!r}, `needs_tool_execution` returned {got!r}; expected {wanted}. {label}")

        return check

    c.visible("True when Claude is asking for tools", expect("tool_use", True, "A comparison already produces True or False; return it."))
    c.hidden("False when the turn ended normally", expect("end_turn", False, ""), concept="Only tool_use means there are tools to run")
    c.hidden("False when the reply was cut off", expect("max_tokens", False, ""), concept="max_tokens is not a request for tools")


@checks("5B")
def _(c):
    def default(run):
        no_crash(run)
        calls = client_calls(run)
        need(len(calls) == 1, f"`fake_client` was called {len(calls)} time(s); call it once, after the tool result has been added to the history.")
        expect_turn(calls[0], BALANCE_ONLY, "At the moment of the call")
        need(run.called("read_balance") == 1, f"`read_balance` ran {run.called('read_balance')} time(s); expected once.")

    c.visible("The fake client receives the question, Claude's request and your tool result", default)

    def printed(run):
        no_crash(run)
        need(any(FINAL_TEXT in line for line in run.lines()), f"The final text ({FINAL_TEXT!r}) should be printed; the output was {run.lines()[-2:]}. The text is inside the final response's content blocks.")

    c.visible("The final text is printed", printed, concept="The second response is the answer; read the text out of its content")

    other_blocks = [text("Checking."), tool("toolu_k2", "read_balance", {"balance_id": "AB104"})]

    def other(run):
        no_crash(run)
        calls = client_calls(run)
        need(len(calls) == 1, f"`fake_client` was called {len(calls)} time(s); expected once.")
        expect_turn(calls[0], other_blocks, "With a different request")

    c.hidden("A request with a text block and a different id", other, with_response(other_blocks), "Keep the whole assistant content; match ids from the blocks")


@checks("5C")
def _(c):
    round2 = sdk_message([tool("toolu_round2", "read_balance", {"balance_id": "XPR205"})], "tool_use", "msg_round2")
    round3 = sdk_message([tool("toolu_round3", "read_balance", {"balance_id": "AB104"})], "tool_use", "msg_round3")

    def loop(expected_steps, expected_requests, label):
        def check(run):
            no_crash(run)
            calls = client_calls(run)
            need(len(calls) == expected_steps, f"{label}: `fake_client` was called {len(calls)} time(s); expected {expected_steps} (once after each round of tool results).")
            for index, blocks in enumerate(expected_requests):
                expect_turn(calls[index], blocks, f"{label}, round {index + 1}")
            steps = run.get("steps", "a counter")
            need(steps == expected_steps, f"{label}: `steps` is {steps!r}; expected {expected_steps}.")
            if expected_steps:
                need(len(calls[-1]) == 1 + 2 * expected_steps, f"{label}: by the last call the history should hold every turn ({1 + 2 * expected_steps} messages), but it has {len(calls[-1])}. Earlier turns must stay in the history.")

        return check

    two_rounds = loop(2, [BALANCE_ONLY, [tool("toolu_round2", "read_balance", {"balance_id": "XPR205"})]], "With the scripted client")
    c.visible("Two tool rounds, then the loop ends on end_turn", two_rounds)

    def printed(run):
        no_crash(run)
        need(run.lines() and run.lines()[-1] == "2", f"Print `steps` after the loop; expected the last output line to be 2, got {run.lines()[-1:]}.")

    c.visible("The number of steps is printed", printed)

    c.hidden("One round is enough", loop(1, [BALANCE_ONLY], "With a client that finishes after one round"), scripted_client([final()]), "The loop ends when the new response is not tool_use")
    c.hidden(
        "Three rounds",
        loop(3, [BALANCE_ONLY, [tool("toolu_round2", "read_balance", {"balance_id": "XPR205"})], [tool("toolu_round3", "read_balance", {"balance_id": "AB104"})]], "With a client that needs three rounds"),
        scripted_client([round2, round3, final()]),
        "Reassign response from fake_client(messages) at the end of every round",
    )
    c.hidden("No tools needed at all", loop(0, [], "With a first response that is already final"), both(with_response([text("Nothing to do.")], "end_turn"), scripted_client([final()])), "A while loop may run zero times")

    def bounded(run):
        no_crash(run)
        calls = len(client_calls(run))
        need(calls <= 100, f"With a client that never stops asking for tools, your loop called it {calls} times. Add a safety bound (a maximum number of steps) so a runaway conversation ends.")

    endless = [sdk_message([tool(f"toolu_n{i}", "read_balance", {"balance_id": "XPR205"})], "tool_use", f"msg_n{i}") for i in range(400)]
    c.hidden("A client that never stops asking for tools", bounded, scripted_client(endless + [final()]), "A maximum number of steps protects against a runaway loop")


@checks("5D")
def _(c):
    def batch(blocks, label):
        def check(run):
            no_crash(run)
            calls = client_calls(run)
            need(len(calls) == 1, f"{label}: `fake_client` was called {len(calls)} time(s); call it once, after all of this turn's results are collected.")
            expect_turn(calls[0], blocks, label)
            for name in ("read_balance", "check_temperature"):
                wanted = sum(1 for b in blocks if b["type"] == "tool_use" and b["name"] == name)
                need(run.called(name) == wanted, f"{label}: `{name}` ran {run.called(name)} time(s); expected {wanted}.")

        return check

    c.visible("Both tools run once and one user message carries both results", batch(BOTH, "With two tool requests"))
    three = [tool("toolu_a", "check_temperature", {"sensor_id": "TEMP05"}), text("and"), tool("toolu_b", "read_balance", {"balance_id": "XPR205"}), tool("toolu_c", "read_balance", {"balance_id": "AB104"})]
    c.hidden("Three requests in another order", batch(three, "With three tool requests"), with_response(three), "The inner loop handles blocks; the client is called after the whole batch")
    c.hidden("A single request", batch(BALANCE_ONLY, "With one tool request"), with_response(BALANCE_ONLY), "The same code handles one tool or several")


@checks("5E")
def _(c):
    def squeeze(value):
        return "".join(str(value).split())

    def expect(blocks, parts, label, stop="end_turn"):
        def check(run):
            no_crash(run)
            got = run.call("extract_text", sdk_message(blocks, stop))
            need(isinstance(got, str), f"{label}: `extract_text` returned {type(got).__name__}; it should return one string.")
            # The separator is the learner's choice (newline, space or none): only content and order are checked.
            need(squeeze(got) == squeeze("".join(parts)), f"{label}: `extract_text` returned {got!r}; expected the text blocks {parts} joined in order.")

        return check

    c.visible("Two text blocks are joined in order", expect([text("Mass: 10.52 g"), text("Stable reading.")], ["Mass: 10.52 g", "Stable reading."], "For the final message"))
    c.hidden("Tool requests between the text blocks are ignored", expect([text("First."), tool("toolu_1", "read_balance", {"balance_id": "XPR205"}), text("Second.")], ["First.", "Second."], "With a tool request between two text blocks", "tool_use"), concept="Check block.type before reading .text")
    c.hidden("A response whose last block is not text", expect([text("Only this."), tool("toolu_1", "read_balance", {"balance_id": "XPR205"})], ["Only this."], "When the last block is a tool request", "tool_use"), concept="Never assume which block is last")
    c.hidden("No text blocks at all", expect([tool("toolu_1", "read_balance", {"balance_id": "XPR205"})], [], "With no text blocks", "tool_use"), concept="Joining nothing gives an empty string")


class _FakeMessages:
    def __init__(self, reply):
        self.calls = []
        self.reply = reply

    def create(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.reply(len(self.calls)) if callable(self.reply) else self.reply


class FakeAnthropic:
    """Stands in for anthropic.Anthropic(): records messages.create calls and returns canned replies."""

    def __init__(self, reply):
        self.messages = _FakeMessages(reply)


@checks("5F")
def _(c):
    tools = [{"name": "read_balance", "description": "Read mass", "input_schema": {"type": "object", "properties": {"balance_id": {"type": "string"}}, "required": ["balance_id"]}}]

    def call(run, messages, model="claude-test-model"):
        sentinel = object()
        client = FakeAnthropic(sentinel)
        got = run.call("call_claude", client, model, messages, tools)
        return client, got, sentinel

    def default(run):
        no_crash(run)
        messages = [{"role": "user", "content": "Read the balance."}]
        client, got, sentinel = call(run, messages)
        need(len(client.messages.calls) == 1, f"`client.messages.create` was called {len(client.messages.calls)} time(s); expected exactly once.")
        need(got is sentinel, "`call_claude` should return what `client.messages.create(...)` returns (the response object), not print it or return something else.")
        args, kwargs = client.messages.calls[0]
        need(not args, "Pass the arguments to `client.messages.create` by name (model=..., max_tokens=..., messages=..., tools=...).")
        for key in ("model", "max_tokens", "messages", "tools"):
            need(key in kwargs, f"`client.messages.create` was called without `{key}`.")
        need(kwargs["model"] == "claude-test-model", f"The model passed on was {kwargs['model']!r}; forward the `model` argument instead of typing a model name.")
        need(kwargs["tools"] == tools, "Forward the `tools` argument unchanged.")
        need(kwargs["messages"] == [{"role": "user", "content": "Read the balance."}], "Forward the `messages` argument unchanged.")
        need(isinstance(kwargs["max_tokens"], int) and kwargs["max_tokens"] > 0, f"`max_tokens` should be a positive whole number; it was {kwargs['max_tokens']!r}.")

    c.visible("One call that forwards model, max_tokens, messages and tools, and returns the response", default)

    def untouched(run):
        no_crash(run)
        messages = [{"role": "user", "content": "A"}, {"role": "assistant", "content": "B"}, {"role": "user", "content": "C"}]
        snapshot = json.dumps(messages)
        call(run, messages, "another-model")
        need(json.dumps(messages) == snapshot, "`call_claude` changed the `messages` list it was given; it should only pass it on.")

    c.hidden("The history is not altered", untouched, concept="The caller owns the history")

    def other_model(run):
        no_crash(run)
        client, _, _ = call(run, [{"role": "user", "content": "x"}], "model-chosen-by-caller")
        need(client.messages.calls, "`client.messages.create` was not called.")
        need(client.messages.calls[0][1].get("model") == "model-chosen-by-caller", "The model must be the one passed in, whatever it is.")

    c.hidden("Whatever model the caller chooses is used", other_model, concept="Dependency injection: nothing is created or hardcoded inside")


LIVE_NOTE = (
    "In this app the exercise is checked offline with a fake client, so no request is sent and no key is needed. "
    "Define `run_agent(client, model, user_text)`: send `user_text` with the `tools` list, run the tool loop with `read_balance` and `check_temperature`, "
    "and return a pair `(final_text, api_calls)` where `api_calls` is how many times you called `client.messages.create`. "
    "To try it for real afterwards, copy your function into the Scratchpad tab (PC Python) and call it with `anthropic.Anthropic()` and a model you choose: "
    "that uses your saved key and is billed to it."
)


@checks("5G")
def _(c):
    c.options(note=LIVE_NOTE)
    request = sdk_message([text("Reading."), tool("toolu_live1", "read_balance", {"balance_id": "XPR205"})], "tool_use", "msg_live1")

    def run_with(run, replies, question="What does the balance read?", model="model-under-test"):
        client = FakeAnthropic(lambda n: replies[min(n, len(replies)) - 1])
        got = run.call("run_agent", client, model, question)
        need(isinstance(got, tuple) and len(got) == 2, f"`run_agent` should return a pair `(final_text, api_calls)`; it returned {type(got).__name__}.")
        return client, got[0], got[1]

    def default(run):
        no_crash(run)
        client, final_text, api_calls = run_with(run, [request, final("The balance reads 10.52 g.")])
        calls = client.messages.calls
        need(len(calls) == 2, f"With one tool round the client should be called twice (request, then continuation); it was called {len(calls)} time(s).")
        need(api_calls == 2, f"`api_calls` was {api_calls!r}; expected 2.")
        need(isinstance(final_text, str) and "10.52" in final_text, f"The returned text was {final_text!r}; expected the text of the final response.")
        first, second = calls[0][1], calls[1][1]
        for kwargs in (first, second):
            need(kwargs.get("model") == "model-under-test", "Use the `model` passed in for every call; do not type a model name in the function.")
            need(kwargs.get("tools") == run.ns.get("tools"), "Pass the `tools` list on every call, so Claude can keep using the tools.")
            need(isinstance(kwargs.get("max_tokens"), int) and kwargs["max_tokens"] > 0, "`max_tokens` should be a positive whole number.")
        need(first.get("messages") and plain(first["messages"][0]).get("role") == "user", "The first call should send the user's question.")
        expect_turn(second["messages"], [text("Reading."), tool("toolu_live1", "read_balance", {"balance_id": "XPR205"})], "On the continuation call")
        need(run.called("read_balance") == 1, f"`read_balance` ran {run.called('read_balance')} time(s); expected once.")

    c.visible("A tool request is executed and its result sent back in a second call", default)

    def no_tools(run):
        no_crash(run)
        client, final_text, api_calls = run_with(run, [final("Hello.")], "Say hello.")
        need(len(client.messages.calls) == 1 and api_calls == 1, f"When Claude answers without tools there should be exactly one call; there were {len(client.messages.calls)} (reported {api_calls!r}).")
        need(final_text == "Hello.", f"The returned text was {final_text!r}; expected 'Hello.'.")
        need(run.called("read_balance") + run.called("check_temperature") == 0, "No tool should run when none is requested.")

    c.hidden("Claude answers without asking for a tool", no_tools, concept="end_turn on the first response means no tool round")

    def offline_by_default(run):
        no_crash(run)
        source = run.source
        need("sk-ant-" not in source, "Never put a key in the code. In live use the SDK reads ANTHROPIC_API_KEY from the environment.")
        need(run.called("run_agent") == 0, "Do not call `run_agent` when the file is run; nothing should contact the API unless you choose to. Define the function only.")

    c.hidden("Nothing is sent just by running the file", offline_by_default, concept="Live calls happen only when you decide to make them")
