"""LAB-AGENT: the learner's own agent.py, grown one milestone at a time.

The checks judge behaviour, not layout. Each case types scripted lines into the program, lets it
talk to the simulated Claude, and then looks at what was printed and at what was sent to Claude.
The simulated Claude used here is the same source the learner sees as fake_claude.py, loaded by
the checker itself and wrapped to record every request.
"""
import os
import sys
import types

try:
    import anthropic as REAL_ANTHROPIC
except ImportError:  # the info command reports this; the simulated Claude needs the SDK's types
    REAL_ANTHROPIC = None

import labcheck
from checks_3p import one_definition, plain_data, schema_of
from labcheck import Fail, checks, need, no_crash, sdk_message, tool, uses_any

LIVE_VARIABLE = "LAB_AGENT_LIVE"
HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "lab_fake_claude.py"), encoding="utf-8") as _fh:
    FAKE_CLAUDE = _fh.read()

READING = "+ 2.1319 g"
ENTRY = "agent.py"

STARTER_NOTE = "Run starts your program in the Output panel: type there and press Enter to talk to it, and type `quit` to end it."
CLAUDE_NOTE = "The Claude in this project is simulated by `fake_claude.py` (second tab, read only). It needs no key and sends nothing over the network. " + STARTER_NOTE


class NoMoreInput(BaseException):
    """The program asked for another line after the scripted ones (the last is always quit) were used up."""


class Session:
    """One scripted conversation with the learner's program."""

    def __init__(self, lines):
        self.lines = list(lines)
        self.prompts = []
        self.exhausted = False
        self.calls = []       # one dict per request: the keyword arguments, with the messages copied
        self.responses = []   # the Message returned for each request

    def input(self, prompt=""):
        self.prompts.append(str(prompt))
        if not self.lines:
            self.exhausted = True
            raise NoMoreInput()
        return self.lines.pop(0)


def _copy_messages(messages):
    copy = []
    for message in messages if isinstance(messages, (list, tuple)) else []:
        if isinstance(message, dict):
            content = message.get("content")
            copy.append({**message, "content": list(content) if isinstance(content, list) else content})
        else:
            copy.append(message)
    return copy


class _StandIn(types.ModuleType):
    """Stands in for the anthropic package while a case runs: everything is the real package except Anthropic()."""

    def __getattr__(self, name):
        return getattr(REAL_ANTHROPIC, name)


def _restore():
    if REAL_ANTHROPIC is not None:
        sys.modules["anthropic"] = REAL_ANTHROPIC
    os.environ.pop(LIVE_VARIABLE, None)


def scenario(*lines, script=None, live=False):
    """A setup step: the lines the person types (quit is added), and a recording simulated Claude.

    `script` replaces what the simulated Claude decides for its first replies (each entry is the
    (blocks, stop_reason) pair that `decide` returns); after that it decides as usual.
    `live` sets the environment variable that asks the program for the real client. The real
    client is never reached: anthropic.Anthropic() is replaced by a recorder that answers with
    the simulation, so the check can see which client the program chose without any request.
    """

    def setup(ns):
        _restore()
        session = Session([*lines, "quit"])
        session.script = list(script or [])
        session.live_clients = []
        module = types.ModuleType("fake_claude")
        module.__file__ = "fake_claude.py"
        exec(compile(FAKE_CLAUDE, "fake_claude.py", "exec"), module.__dict__)
        original = module.Messages.create
        decide = module.decide

        def create(self, **kwargs):
            session.calls.append({**kwargs, "messages": _copy_messages(kwargs.get("messages"))})
            response = original(self, **kwargs)
            session.responses.append(response)
            return response

        def scripted(messages, tool_names, system):
            return session.script.pop(0) if session.script else decide(messages, tool_names, system)

        class LiveClient:
            def __init__(self, **options):
                session.live_clients.append(options)
                self.requests = 0
                self.tool_requests = 0
                self.messages = module.Messages(self)

        module.Messages.create = create
        module.decide = scripted
        sys.modules["fake_claude"] = module
        stand_in = _StandIn("anthropic")
        stand_in.Anthropic = LiveClient
        sys.modules["anthropic"] = stand_in
        if live:
            os.environ[LIVE_VARIABLE] = "1"
        labcheck.CLEANUPS.append(_restore)
        ns["input"] = session.input
        ns["__lab_session__"] = session

    return setup


def asks_for(*requests, words="Let me do that."):
    """A scripted reply from Claude that requests tools: (name, input) pairs."""
    return ([{"type": "text", "text": words}, *[{"type": "tool_use", "name": name, "input": tool_input} for name, tool_input in requests]], "tool_use")


def session_of(run):
    session = run.ns.get("__lab_session__")
    need(session is not None, "The checker could not start the scripted conversation. Please report this.")
    if session.exhausted:
        raise Fail("Your program asked for input again after `quit` was typed. The loop must end (break) when the question is quit.")
    no_crash(run)
    need(not session.lines, f"Your program ended before reading everything that was typed; {len(session.lines)} line(s) were never read. Is the input inside the `while True:` loop?")
    return session


def agent_lines(run):
    return [line for line in run.lines() if line.lower().startswith("agent:")]


def expect_agent_line(run, fragment, when):
    lines = agent_lines(run)
    if any(fragment in line for line in lines):
        return
    if any(fragment in line for line in run.lines()):
        raise Fail(f"{when}, the text {fragment!r} was printed, but not on a line starting with `Agent:`. Output: {run.lines()[:6]}")
    raise Fail(f"{when}, expected a line starting with `Agent:` that contains {fragment!r}. Output: {run.lines()[:6] or 'nothing'}")


def ends_politely(run):
    lines = run.lines()
    need(lines and "goodbye" in lines[-1].lower(), f"After `quit` the last thing printed should be Goodbye; the output ended with {lines[-1:] or 'nothing'}.")


def text_of(response):
    return " ".join(block.text for block in response.content if block.type == "text")


def workspace(with_claude, previous=None, checkpoint=None):
    options = {"entry": ENTRY, "interactive": True, "note": CLAUDE_NOTE if with_claude else STARTER_NOTE}
    if with_claude:
        options["locked"] = {"fake_claude.py": FAKE_CLAUDE}
    if previous:
        options["previous"] = previous
    if checkpoint:
        options["explanation"] = checkpoint
    return options


# ----------------------------------------------------------------- behaviours shared by milestones

def chat_shell_cases(c, echo=True):
    def quits(run):
        session = session_of(run)
        ends_politely(run)
        need(len(session.prompts) == 1, f"With only `quit` typed, input should be asked for once; it was asked for {len(session.prompts)} times.")
        need(not agent_lines(run), f"`quit` should not be answered as a question; printed {agent_lines(run)}.")

    c.hidden("quit ends the program at once", quits, scenario(), "break leaves the loop")

    if echo:
        def several(run):
            session_of(run)
            lines = agent_lines(run)
            need(len(lines) == 3 and all(f"You said: {word}" in line for word, line in zip(("one", "two", "three"), lines)), f"Three questions should give three `Agent: You said: ...` lines in order; got {lines}.")
            ends_politely(run)

        c.hidden("Several questions in a row", several, scenario("one", "two", "three"), "The loop goes round once per question")


def balance_function_case(c):
    def returns(run):
        session_of(run)
        got = run.call("read_balance")
        need(got == READING, f"`read_balance()` returned {got!r}; it should return the string {READING!r}.")
        need(run.call_output.strip() == "", f"`read_balance()` printed {run.call_output.strip()!r}. A tool returns its reading; the caller decides what to print.")

    c.visible("read_balance() returns the reading", returns, scenario(), "A tool returns its result")


def tools_cases(c, visible=True):
    def defined(run):
        session_of(run)
        definition = one_definition(run)
        need(definition["name"] == "read_balance", f"The tool's name is {definition['name']!r}; it should be \"read_balance\", the name your dispatcher will look for.")
        schema = schema_of(definition)
        need(schema["properties"] == {}, f"`read_balance` takes no arguments, so \"properties\" should be empty; it declares {list(schema['properties'])}.")
        need(schema.get("required", []) == [], "Nothing can be required when no arguments are declared.")
        description = definition["description"]
        need(isinstance(description, str) and len(description.split()) >= 8, f"The description is {description!r}. Claude chooses tools from this text, so use at least eight words and say what comes back.")

    (c.visible if visible else c.hidden)("`tools` describes read_balance, with no arguments", defined, scenario(), "The definition is all Claude knows about your tool")
    c.hidden("The definition is plain data", lambda run: (session_of(run), plain_data(run)), scenario(), "A definition is sent as JSON")


def request_cases(c):
    """From LAB-04 on: questions go to Claude with the tools; quit does not."""

    def greeting(run):
        session = session_of(run)
        need(len(session.calls) == 1, f"One question should make one request to Claude; {len(session.calls)} were made.")
        call = session.calls[0]
        need(call.get("tools"), "The request did not include your `tools`. Without them Claude does not know the balance exists.")
        need(call["tools"] == run.ns.get("tools"), "The request's `tools` should be your `tools` list.")
        last = call["messages"][-1]
        need(last.get("role") == "user" and "hello there" in str(last.get("content")), f"The last message of the request should be the person's question as a user message; it was {last}.")
        expect_agent_line(run, text_of(session.responses[0]), "For a greeting")
        ends_politely(run)

    c.visible("A question is sent to Claude and its answer is printed", greeting, scenario("hello there"))

    def no_request_for_quit(run):
        session = session_of(run)
        need(len(session.calls) == 0, f"`quit` should end the program without a request to Claude; {len(session.calls)} were made.")
        ends_politely(run)

    c.hidden("quit makes no request", no_request_for_quit, scenario(), "Test for quit before calling Claude")


def no_dynamic_lookup(run):
    used = uses_any(run, {"eval", "exec", "globals", "locals", "getattr", "__import__"})
    need(not used, f"The program uses {', '.join(used)}. Route tool names with explicit if/elif (or a dictionary of allowed functions) so only tools you list can ever run.")


def dispatcher_cases(c):
    def known(run):
        session_of(run)
        got = run.call("run_tool", "read_balance", {})
        need(got == READING, f"`run_tool(\"read_balance\", {{}})` returned {got!r}; expected the reading {READING!r}.")

    c.visible("run_tool runs read_balance", known, scenario())

    def unknown(run):
        session_of(run)
        before = run.called("read_balance")
        got = run.call("run_tool", "open_door", {})
        need(isinstance(got, str) and "open_door" in got and "unknown" in got.lower(), f"For a name it does not know, `run_tool` should return \"Unknown tool: open_door\"; it returned {got!r}.")
        need(run.called("read_balance") == before, "An unknown tool name must not run the balance.")

    c.hidden("run_tool refuses a name it does not know", unknown, scenario(), "Unknown names run nothing")
    c.hidden("Only listed tools can run", lambda run: (session_of(run), no_dynamic_lookup(run)), scenario(), "Never run a function chosen by an arbitrary string")


def result_function_case(c, visible=True):
    def builds(run):
        session_of(run)
        block = sdk_message([tool("toolu_check_7", "read_balance", {})]).content[0]
        got = run.call("make_tool_result", block, "+ 0.5000 g")
        need(isinstance(got, dict), f"`make_tool_result` should return a dictionary; it returned {got!r}.")
        need(got.get("type") == "tool_result", f"The dictionary needs \"type\": \"tool_result\"; found {got.get('type')!r}.")
        need(got.get("tool_use_id") == "toolu_check_7", f"\"tool_use_id\" should be the id of the request it answers (block.id); found {got.get('tool_use_id')!r}.")
        need(got.get("content") == "+ 0.5000 g", f"\"content\" should be the result that was passed in; found {got.get('content')!r}.")
        extra = set(got) - {"type", "tool_use_id", "content", "is_error"}
        need(not extra, f"The tool_result has keys the API does not accept: {sorted(extra)}.")

    (c.visible if visible else c.hidden)("make_tool_result builds the block for one request", builds, scenario(), "tool_use_id links a result to its request")


def history_of(session, index):
    need(len(session.calls) > index, f"Expected at least {index + 1} request(s) to Claude; {len(session.calls)} were made.")
    return session.calls[index]["messages"]


def roles(messages):
    return [m.get("role") if isinstance(m, dict) else "?" for m in messages]


def round_trip_cases(c):
    """From LAB-07 on: results go back to Claude, and the conversation is kept."""

    def weigh(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"A weighing question should make two requests (the question, then the result); {len(session.calls)} were made.")
        second = history_of(session, 1)
        need(roles(second) == ["user", "assistant", "user"], f"The second request should carry three messages: user question, assistant reply, user results. Its roles were {roles(second)}.")
        need(second[1]["content"] == session.responses[0].content, "The assistant message should have Claude's whole reply, `response.content`, as its content.")
        request_id = next(b.id for b in session.responses[0].content if b.type == "tool_use")
        results = second[2]["content"]
        need(isinstance(results, list) and len(results) == 1 and isinstance(results[0], dict), f"The third message's content should be your list of tool_result dictionaries; it was {results!r}.")
        need(results[0].get("tool_use_id") == request_id, f"The tool_result's id is {results[0].get('tool_use_id')!r}; Claude's request had the id {request_id!r}.")
        need(results[0].get("content") == READING, f"The tool_result's content is {results[0].get('content')!r}; expected the balance reading {READING!r}.")
        need(run.called("read_balance") == 1, f"The balance should be read once; it was read {run.called('read_balance')} time(s).")
        expect_agent_line(run, "The balance reads " + READING, "After the result was sent back")
        ends_politely(run)

    c.visible("The result goes back to Claude and its final answer is printed", weigh, scenario("please weigh the sample"))

    def remembers(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"Two questions that need no tool should make two requests; {len(session.calls)} were made.")
        second = history_of(session, 1)
        need(roles(second) == ["user", "assistant", "user"], f"The second question should be sent with the conversation so far (user, assistant, user); the roles sent were {roles(second)}.")
        expect_agent_line(run, 'The first thing you asked was: "hello"', "When asked about the first question")

    c.visible("A later question is sent with the conversation so far", remembers, scenario("hello", "what was the first thing I asked?"), "Claude only knows what is in messages")

    def after_a_tool(run):
        session = session_of(run)
        need(len(session.calls) == 3, f"A weighing question and then a plain one should make three requests; {len(session.calls)} were made.")
        third = history_of(session, 2)
        need(roles(third) == ["user", "assistant", "user", "assistant", "user"], f"The third request should hold the whole exchange in order; its roles were {roles(third)}. Was Claude's final answer appended to messages?")

    c.hidden("The history continues correctly after a tool was used", after_a_tool, scenario("weigh it", "hello"), "Every reply from Claude is appended, including the final one")

    def plain(run):
        session = session_of(run)
        need(len(session.calls) == 1, f"A question that needs no tool should make one request; {len(session.calls)} were made.")
        need(run.called("read_balance") == 0, "The balance was read although Claude did not ask for it.")
        need(len(agent_lines(run)) == 1, f"The answer should be printed once; `Agent:` lines were {agent_lines(run)}.")

    c.hidden("A question that needs no tool", plain, scenario("hello"), "stop_reason end_turn means there is nothing to run")


# ----------------------------------------------------------------- LAB-01

@checks("LAB-01")
def _(c):
    c.options(**workspace(False))

    def answers(run):
        session_of(run)
        need(run.lines() == ["Agent: You said: hello", "Goodbye"], f"Typing hello and then quit should print exactly two lines, 'Agent: You said: hello' and 'Goodbye'. Output: {run.lines()[:6] or 'nothing'}")

    c.visible("hello is answered, and quit ends the program", answers, scenario("hello"))

    def returns(run):
        session_of(run)
        got = run.call("reply", "is anyone there")
        need(got == "You said: is anyone there", f"`reply(\"is anyone there\")` returned {got!r}; expected 'You said: is anyone there'.")
        need(run.call_output.strip() == "", "`reply` printed something. It should return the text; the loop does the printing.")

    c.visible("reply returns the text instead of printing it", returns, scenario(), "return hands a value back to the caller")
    chat_shell_cases(c)


# ----------------------------------------------------------------- LAB-02

def hard_wired_cases(c):
    def weigh(run):
        session_of(run)
        expect_agent_line(run, READING, "After typing weigh")
        need(run.called("read_balance") == 1, f"One `weigh` should read the balance once; it was read {run.called('read_balance')} time(s).")

    c.visible("Typing weigh reads the balance", weigh, scenario("weigh"))

    def others(run):
        session_of(run)
        need(run.lines() == ["Agent: You said: hello", "Goodbye"], f"Other questions should be answered as before; output was {run.lines()[:6]}.")
        need(run.called("read_balance") == 0, "The balance was read for a question that was not `weigh`.")

    c.hidden("Other questions are answered as before", others, scenario("hello"), "The tool runs only when asked for")

    def twice(run):
        session_of(run)
        need(run.called("read_balance") == 2, f"Typing weigh twice should read the balance twice; it was read {run.called('read_balance')} time(s).")
        need(len([line for line in agent_lines(run) if READING in line]) == 2, "Each weigh should print its own reading.")

    c.hidden("weigh typed twice", twice, scenario("weigh", "weigh"), "Call the function each time; do not store an old reading")


@checks("LAB-02")
def _(c):
    c.options(**workspace(False, "LAB-01"))
    balance_function_case(c)
    hard_wired_cases(c)
    chat_shell_cases(c)


# ----------------------------------------------------------------- LAB-03

@checks("LAB-03")
def _(c):
    c.options(**workspace(False, "LAB-02"))
    tools_cases(c)
    hard_wired_cases(c)
    chat_shell_cases(c)


# ----------------------------------------------------------------- LAB-04

def shows_request(run, expect_called):
    session = session_of(run)
    need(len(session.calls) >= 1, "No request was made to Claude for the question.")
    shown = [line for line in run.lines() if "read_balance" in line and "asks to run" in line.lower()]
    need(shown, f"When Claude asks for a tool, print a line such as 'Claude asks to run read_balance with {{}}'. Output: {run.lines()[:6] or 'nothing'}")
    expect_agent_line(run, "I'll check that for you.", "When Claude sends text along with a tool request")
    need(run.called("read_balance") == expect_called, f"`read_balance` ran {run.called('read_balance')} time(s); expected {expect_called} at this milestone.")
    return session


@checks("LAB-04")
def _(c):
    c.options(**workspace(True, "LAB-03", [
        {"point": "Says that Claude decided to ask for the balance (from the question and the tool description)", "any": [["claude", "decid"], ["claude", "ask"], ["claude", "request"], ["claude", "chose"], ["claude", "choos"]]},
        {"point": "Says that the program only prints the request so far; nothing has run the balance", "any": [["only", "print"], ["just", "print"], ["not", "run"], ["n't", "run"], ["nothing", "run"], ["not", "call"], ["n't", "call"], ["not", "execut"], ["yet"]]},
    ]))
    request_cases(c)

    c.visible("A weighing question shows Claude's request, and nothing runs yet", lambda run: shows_request(run, 0), scenario("please weigh the sample"), "A tool_use block is a request, not an action")

    def not_hard_wired(run):
        session = session_of(run)
        need(len(session.calls) == 1, f"The word weigh should now go to Claude like any other question; {len(session.calls)} request(s) were made.")
        need(run.called("read_balance") == 0, "Typing `weigh` still ran the balance directly. Remove the hard-wired test; Claude decides now.")

    c.hidden("The hard-wired weigh command is gone", not_hard_wired, scenario("weigh"), "Claude decides when a tool is needed")

    def one_each(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"Two questions should make two requests; {len(session.calls)} were made.")
        need(len(agent_lines(run)) == 2, f"Each answer should be printed once; `Agent:` lines were {agent_lines(run)}.")

    c.hidden("Two questions, two requests", one_each, scenario("hello", "what can you do?"), "One request per question")
    tools_cases(c, visible=False)


# ----------------------------------------------------------------- LAB-05

@checks("LAB-05")
def _(c):
    c.options(**workspace(True, "LAB-04"))
    dispatcher_cases(c)

    def runs(run):
        shows_request(run, 1)
        need(any(READING in line for line in run.lines()), f"After running the tool, print its result, for example 'Tool result: {READING}'. Output: {run.lines()[:6]}")
        need(run.called("run_tool") == 1, f"`run_tool` should be called once for the one request; it was called {run.called('run_tool')} time(s).")

    c.visible("A weighing question runs the balance and prints the result", runs, scenario("please weigh the sample"))

    def idle(run):
        session_of(run)
        need(run.called("read_balance") == 0 and run.called("run_tool") == 0, "No tool should run when Claude answers in words only.")

    c.hidden("A question that needs no tool runs nothing", idle, scenario("hello"), "Tools run only for tool_use blocks")
    request_cases(c)


# ----------------------------------------------------------------- LAB-06

@checks("LAB-06")
def _(c):
    c.options(**workspace(True, "LAB-05"))
    result_function_case(c)

    def one_per_request(run):
        shows_request(run, 1)
        need(run.called("make_tool_result") == 1, f"One tool request should produce one tool_result; `make_tool_result` was called {run.called('make_tool_result')} time(s).")
        results = run.ns.get("results")
        if results is not None:
            need(isinstance(results, list) and len(results) == 1 and isinstance(results[0], dict) and results[0].get("content") == READING, f"`results` should hold the one tool_result with the reading as its content; it is {results!r}.")

    c.visible("One tool_result is collected for the request", one_per_request, scenario("please weigh the sample"))

    def none(run):
        session_of(run)
        need(run.called("make_tool_result") == 0, "No tool_result should be made when Claude asked for no tool.")

    c.hidden("No tool_result without a request", none, scenario("hello"), "Results answer requests")

    def fresh_list(run):
        session_of(run)
        need(run.called("make_tool_result") == 2, f"Two weighing questions should make two tool_results; {run.called('make_tool_result')} were made.")
        results = run.ns.get("results")
        if isinstance(results, list):
            need(len(results) == 1, f"`results` should start empty for each question; after two questions it holds {len(results)} items.")

    c.hidden("results starts empty for each question", fresh_list, scenario("weigh it", "weigh it again please"), "Results belong to one reply from Claude")
    dispatcher_cases(c)
    request_cases(c)


# ----------------------------------------------------------------- LAB-07

@checks("LAB-07")
def _(c):
    c.options(**workspace(True, "LAB-06"))
    round_trip_cases(c)
    result_function_case(c, visible=False)
    c.hidden("quit makes no request", lambda run: (need(len(session_of(run).calls) == 0, "`quit` should not make a request."), ends_politely(run)), scenario(), "Test for quit before calling Claude")


# ----------------------------------------------------------------- LAB-08

@checks("LAB-08")
def _(c):
    c.options(**workspace(True, "LAB-07", [
        {"point": "Names the stop reason that keeps the loop going (tool_use)", "any": [["tool_use"]]},
        {"point": "Says the loop ends when Claude stops asking for tools (end_turn, or a final answer)", "any": [["end_turn"], ["final"], ["until"], ["stops"], ["no more"], ["no longer"]]},
        {"point": "Counts the three requests for \"weigh it twice\"", "any": [["three"], ["3 "], ["third"]]},
    ]))

    def twice(run):
        session = session_of(run)
        need(len(session.calls) == 3, f"\"weigh it twice\" needs three requests (question, first result, second result); {len(session.calls)} were made. After the first result Claude asks again: is that second request handled?")
        need(run.called("read_balance") == 2, f"The balance should be read twice; it was read {run.called('read_balance')} time(s).")
        third = history_of(session, 2)
        need(roles(third) == ["user", "assistant", "user", "assistant", "user"], f"The third request should carry both rounds in order; its roles were {roles(third)}.")
        expect_agent_line(run, f"{READING} and then {READING}", "After both readings")
        ends_politely(run)

    c.visible("Claude asks twice and the loop handles both rounds", twice, scenario("weigh it twice"))
    round_trip_cases(c)

    def long_session(run):
        session = session_of(run)
        need(len(session.calls) == 6, f"twice (3 requests), weigh (2) and hello (1) should make six requests; {len(session.calls)} were made.")
        need(run.called("read_balance") == 3, f"The balance should be read three times in this conversation; it was read {run.called('read_balance')} time(s).")

    c.hidden("A longer conversation mixing all three kinds of question", long_session, scenario("weigh it twice", "now weigh the next one", "hello"), "The same loop serves every question")
    result_function_case(c, visible=False)
