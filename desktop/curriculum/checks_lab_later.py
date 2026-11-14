"""LAB-AGENT milestones LAB-09 to LAB-12: a second tool, failures, the real connection, the system
prompt, and reorganising the program. Built on the scripted conversations in checks_lab.py."""
import json
import os
import re

from checks_3p import schema_of
from checks_lab import (
    HERE, LIVE_VARIABLE, READING, agent_lines, asks_for, ends_politely, expect_agent_line, history_of, no_dynamic_lookup, roles,
    round_trip_cases, scenario, session_of, workspace,
)
from labcheck import Fail, checks, need


# ----------------------------------------------------------------- behaviours from LAB-08 on

def loop_cases(c):
    def twice(run):
        session = session_of(run)
        need(len(session.calls) == 3, f"\"weigh it twice\" needs three requests; {len(session.calls)} were made.")
        need(run.called("read_balance") == 2, f"The balance should be read twice; it was read {run.called('read_balance')} time(s).")
        expect_agent_line(run, f"{READING} and then {READING}", "After both readings")

    c.hidden("The loop still handles two rounds", twice, scenario("weigh it twice"), "while stop_reason is tool_use")


def results_sent(session, index):
    """The tool_result blocks in the last message of one request."""
    messages = history_of(session, index)
    content = messages[-1].get("content") if isinstance(messages[-1], dict) else None
    need(isinstance(content, list) and all(isinstance(b, dict) and b.get("type") == "tool_result" for b in content), f"Request {index + 1} should end with a user message holding tool_result dictionaries; its content was {content!r}.")
    return content


def expect_error_result(block, fragment, what):
    need(block.get("is_error") is True, f"{what}: the tool_result should have \"is_error\": True so Claude knows the tool failed; it had is_error = {block.get('is_error')!r}.")
    content = block.get("content")
    need(isinstance(content, str) and content.strip(), f"{what}: the tool_result's content should be text saying what went wrong; it was {content!r}.")
    need(fragment.lower() in content.lower(), f"{what}: the error text should mention {fragment!r} so that Claude (and you) can tell what failed; it was {content!r}.")


def second_tool_cases(c):
    def function(run):
        session_of(run)
        got = run.call("check_temperature", "TEMP05")
        need(got == {"sensor_id": "TEMP05", "temperature": 22.4, "unit": "C"}, f"`check_temperature(\"TEMP05\")` returned {got!r}; expected the dictionary with sensor_id, temperature 22.4 and unit C.")
        fn = run.get("check_temperature", "a function")
        try:
            fn("TEMP00")
        except RuntimeError as exc:
            need("TEMP00" in str(exc), f"The RuntimeError for the disconnected sensor should name it; its message was {str(exc)!r}.")
        except Exception as exc:  # noqa: BLE001
            raise Fail(f"`check_temperature(\"TEMP00\")` should raise RuntimeError; it raised {type(exc).__name__}.") from None
        else:
            raise Fail("`check_temperature(\"TEMP00\")` should raise RuntimeError: that sensor is disconnected in this simulation.")

    c.visible("check_temperature returns a reading, and fails for the disconnected sensor", function, scenario(), "A tool can fail; raise says so")

    def declared(run):
        session_of(run)
        tools = run.get("tools", "a list")
        need(isinstance(tools, list) and all(isinstance(t, dict) for t in tools), "`tools` should be a list of definitions.")
        names = [t.get("name") for t in tools]
        need(sorted(str(n) for n in names) == ["check_temperature", "read_balance"], f"`tools` should define read_balance and check_temperature; it defines {names}.")
        definition = next(t for t in tools if t["name"] == "check_temperature")
        need(isinstance(definition.get("description"), str) and len(definition["description"].split()) >= 8, "Give check_temperature a description of at least eight words.")
        need("input_schema" in definition, "The check_temperature definition has no \"input_schema\".")
        schema = schema_of(definition)
        need(list(schema["properties"]) == ["sensor_id"] and isinstance(schema["properties"]["sensor_id"], dict) and schema["properties"]["sensor_id"].get("type") == "string", f"check_temperature should declare one string argument, sensor_id; it declares {schema['properties']}.")
        need(schema.get("required") == ["sensor_id"], f"sensor_id should be required; \"required\" is {schema.get('required')!r}.")
        try:
            json.dumps(tools)
        except (TypeError, ValueError) as exc:
            raise Fail(f"`tools` cannot be sent as JSON ({exc}).") from None

    c.visible("`tools` describes both tools", declared, scenario(), "Each tool needs its own definition")

    def temperature(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"A temperature question should make two requests; {len(session.calls)} were made.")
        results = results_sent(session, 1)
        need(len(results) == 1, f"One request should get one result; {len(results)} were sent.")
        content = results[0].get("content")
        need(isinstance(content, str), f"The temperature result is a dictionary, so turn it into text with json.dumps; the content sent was {type(content).__name__}.")
        try:
            reading = json.loads(content)
        except ValueError:
            raise Fail(f"The temperature result should be sent as JSON text (json.dumps); it was {content!r}.") from None
        need(reading == {"sensor_id": "TEMP07", "temperature": 22.4, "unit": "C"}, f"The result sent was {reading!r}; expected the reading for TEMP07, the sensor Claude asked for.")
        need(not results[0].get("is_error"), "A successful result must not be marked is_error.")
        need(run.called("check_temperature") == 1 and run.called("read_balance") == 0, "Only the temperature sensor should have been read.")
        expect_agent_line(run, "22.4", "After the temperature was sent back")

    c.visible("Claude asks for a temperature and gets it as JSON text", temperature, scenario("what is the temperature at TEMP07?"), "tool_input carries the argument; content must be text")

    def both(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"One reply asking for two tools should lead to two requests in all; {len(session.calls)} were made.")
        asked = [b.id for b in session.responses[0].content if b.type == "tool_use"]
        results = results_sent(session, 1)
        need([b.get("tool_use_id") for b in results] == asked, f"Both results should go back in one message, in the order asked, each with its own id. Asked: {asked}; sent: {[b.get('tool_use_id') for b in results]}.")
        need(results[0].get("content") == READING, "The first result should be the balance reading.")
        need(run.called("read_balance") == 1 and run.called("check_temperature") == 1, "Each of the two tools should run once.")

    c.hidden("Two tools requested in one reply", both, scenario("weigh it and tell me the temperature at TEMP02"), "One result per request, all in one user message")


def failure_cases(c):
    def unknown(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"After a failed tool the result should still be sent back; {len(session.calls)} request(s) were made.")
        expect_error_result(results_sent(session, 1)[0], "open_door", "For a tool your program does not have")
        need(run.called("read_balance") + run.called("check_temperature") == 0, "A request for an unknown tool must not run any instrument.")
        expect_agent_line(run, "failed", "After the failure was reported to Claude")
        ends_politely(run)

    c.visible("An unknown tool becomes an error result, not a crash", unknown, scenario("open the door", script=[asks_for(("open_door", {}))]), "is_error tells Claude the tool failed")

    def missing(run):
        session = session_of(run)
        need(len(session.calls) == 2, f"After a failed tool the result should still be sent back; {len(session.calls)} request(s) were made.")
        expect_error_result(results_sent(session, 1)[0], "sensor_id", "For a request without the required sensor_id")
        need(run.called("check_temperature") == 0, "The sensor must not be read when its argument is missing.")

    c.hidden("A request with a missing argument", missing, scenario("temperature please", script=[asks_for(("check_temperature", {}))]), "Claude's arguments can be wrong; check before using them")

    def instrument(run):
        session = session_of(run)
        need(len(session.calls) == 4, f"The failed reading (2 requests) and the weighing after it (2) should make four requests; {len(session.calls)} were made.")
        expect_error_result(results_sent(session, 1)[0], "TEMP00", "When the instrument raises an error")
        later = results_sent(session, 3)
        need(later[0].get("content") == READING and not later[0].get("is_error"), "After a failure, the next question should work normally and its result must not be marked as an error.")

    c.hidden("An instrument failure is reported, and the chat carries on", instrument, scenario("what is the temperature at TEMP00?", "now weigh the sample"), "try/except around the tool call")

    def one_bad_one_good(run):
        session = session_of(run)
        results = results_sent(session, 1)
        need(len(results) == 2, f"Two requests need two results even when one fails; {len(results)} were sent.")
        expect_error_result(results[0], "open_door", "The failed request")
        need(results[1].get("content") == READING and not results[1].get("is_error"), "The request that worked should carry its reading and not be marked as an error.")

    c.hidden("One request fails and one works in the same reply", one_bad_one_good, scenario("do both", script=[asks_for(("open_door", {}), ("read_balance", {}))]), "A failure does not cancel the other results")


# ----------------------------------------------------------------- LAB-09

@checks("LAB-09")
def _(c):
    c.options(**workspace(True, "LAB-08"))
    second_tool_cases(c)
    failure_cases(c)
    round_trip_cases(c)
    loop_cases(c)
    c.hidden("Only listed tools can run", lambda run: (session_of(run), no_dynamic_lookup(run)), scenario(), "Never run a function chosen by an arbitrary string")


# ----------------------------------------------------------------- LAB-10

def mode_line(run, word):
    lines = run.lines()
    need(lines and word in lines[0].lower(), f"The first thing printed should say which mode the program is in and contain the word \"{word}\"; the first line was {lines[:1] or 'nothing'}.")


def connection_cases(c):
    def simulated(run):
        session = session_of(run)
        need(session.live_clients == [], "Without LAB_AGENT_LIVE set to 1 the program created the real client. It must use the simulated one unless asked.")
        mode_line(run, "simulated")
        need(len(session.calls) == 2, f"A weighing question should make two requests; {len(session.calls)} were made.")
        need(run.called("call_claude") == 2, f"Every request should go through `call_claude`; it was called {run.called('call_claude')} time(s) for 2 requests.")

    c.visible("By default it is simulated, and every request goes through call_claude", simulated, scenario("please weigh the sample"))

    def live(run):
        session = session_of(run)
        need(len(session.live_clients) == 1, f"With LAB_AGENT_LIVE set to 1 the program should create anthropic.Anthropic() once; it created it {len(session.live_clients)} time(s).")
        need("api_key" not in session.live_clients[0], "Do not pass api_key yourself. anthropic.Anthropic() reads ANTHROPIC_API_KEY from the environment.")
        mode_line(run, "live")
        need(len(session.calls) == 2 and run.called("call_claude") == 2, "In live mode the same loop should run, through `call_claude`.")
        expect_agent_line(run, "The balance reads " + READING, "In live mode (answered by a stand-in for this check)")

    c.visible("With LAB_AGENT_LIVE=1 it creates the real client instead", live, scenario("please weigh the sample", live=True), "One switch, read from the environment; the rest of the program is identical")

    def no_key(run):
        session_of(run)
        need(not re.search(r"sk-ant-|api_key\s*=\s*[\"']", run.source), "The program contains what looks like an API key, or passes api_key as text. A key never belongs in source code.")

    c.hidden("No key is written in the program", no_key, scenario(), "Keys come from the environment, never from source")

    def other_values(run):
        session = session_of(run)
        need(session.live_clients == [], "LAB_AGENT_LIVE must be exactly \"1\" to go live; with the value 0 the program created the real client.")

    def zero(ns):
        scenario()(ns)
        os.environ[LIVE_VARIABLE] = "0"

    c.hidden("LAB_AGENT_LIVE=0 stays simulated", other_values, zero, "Compare with == \"1\"")


@checks("LAB-10")
def _(c):
    c.options(**workspace(True, "LAB-09"), live=True)
    connection_cases(c)
    second_tool_cases(c)
    failure_cases(c)
    round_trip_cases(c)
    loop_cases(c)


# ----------------------------------------------------------------- LAB-11

def first_sentence(text):
    return re.split(r"(?<=[.!?])\s", text.strip(), maxsplit=1)[0]


def rules_of(run):
    rules = run.get("rules", "a string")
    need(isinstance(rules, str), f"`rules` should be a string of instructions; it is {type(rules).__name__}.")
    return rules


def prompt_cases(c):
    def sent(run):
        session = session_of(run)
        rules = rules_of(run)
        need(len(session.calls) == 2, f"A weighing question should make two requests; {len(session.calls)} were made.")
        for index, call in enumerate(session.calls):
            need(call.get("system") == rules, f"Request {index + 1} did not carry your rules. Pass `system=rules` every time; a system prompt is not remembered between requests.")

    c.visible("Every request carries the rules as its system prompt", sent, scenario("please weigh the sample"))

    def reaches(run):
        session_of(run)
        expect_agent_line(run, f'My instructions begin: "{first_sentence(rules_of(run))}"', "When asked who it is")

    c.visible("Claude can see the rules", reaches, scenario("who are you?"), "system is a parameter of the request, not a message")

    def covers(run):
        session_of(run)
        rules = rules_of(run)
        lowered = rules.lower()
        need(len(rules.split()) >= 25, f"The rules are {len(rules.split())} words long. Write at least 25: a model can only follow what it is told.")
        need("balance" in lowered or "lab" in lowered, "The rules should say what this assistant is for (a lab, a balance).")
        need(any(word in lowered for word in ("invent", "guess", "make up", "estimate", "made up", "only report", "never state")), "The rules should say that readings come only from the tools: never invent, guess or estimate one.")
        need(any(word in lowered for word in ("fail", "error", "problem", "goes wrong", "cannot")), "The rules should say what to do when a tool fails.")

    c.visible("The rules cover purpose, honesty about readings, and failures", covers, scenario(), "Write for a reader who knows nothing else")

    def descriptions(run):
        session_of(run)
        for definition in run.get("tools", "a list"):
            words = len(str(definition.get("description", "")).split())
            need(words >= 15, f"The description of {definition.get('name')} is {words} words. Say what it does, what comes back, and what a failure looks like, in at least 15.")

    c.hidden("Both tool descriptions are detailed", descriptions, scenario(), "Claude chooses tools from their descriptions")


@checks("LAB-11")
def _(c):
    c.options(**workspace(True, "LAB-10"), live=True)
    prompt_cases(c)
    connection_cases(c)
    failure_cases(c)
    round_trip_cases(c)
    loop_cases(c)


# ----------------------------------------------------------------- LAB-12

with open(os.path.join(HERE, "lab_other_inline.py"), encoding="utf-8") as _fh:
    OTHER_INLINE = _fh.read()
with open(os.path.join(HERE, "lab_other_tool_runner.py"), encoding="utf-8") as _fh:
    OTHER_RUNNER = _fh.read()


@checks("LAB-12")
def _(c):
    options = workspace(True, "LAB-11", [
        {"point": "Says where the while loop went in the tool-runner version (the SDK's runner does it)", "any": [["runner", "loop"], ["sdk", "loop"], ["tool_runner"], ["library", "loop"]]},
        {"point": "Says where the tool definitions went (made from the function by @beta_tool)", "any": [["beta_tool"], ["decorator"], ["docstring"], ["signature"], ["generated"]]},
        {"point": "Finds the same parts in the inline version (the request, the dispatch, the results)", "any": [["inline"], ["lookup"], ["dictionary"], ["same"]]},
    ])
    options["locked"] = {**options["locked"], "other_inline.py": OTHER_INLINE, "other_tool_runner.py": OTHER_RUNNER}
    options["note"] += " `other_inline.py` and `other_tool_runner.py` are two other people's versions of the same agent, for reading only; they are not run or tested."
    c.options(**options, live=True)

    def ask_function(run):
        session = session_of(run)
        before = len(session.calls)
        history = []
        got = run.call("ask", "please weigh the sample", history)
        need(isinstance(got, str), f"`ask` should return the final answer as text; it returned {got!r}.")
        need("The balance reads " + READING in got, f"`ask` returned {got!r}; expected Claude's final answer, which quotes the reading.")
        need(len(session.calls) - before == 2, f"One weighing question inside `ask` should make two requests; it made {len(session.calls) - before}.")
        need(roles(history) == ["user", "assistant", "user", "assistant"], f"`ask` should add the whole exchange to the list it is given; afterwards its roles were {roles(history)}.")
        need(not any(line.lower().startswith("agent:") and READING in line for line in run.call_output.splitlines()), "`ask` printed the final answer itself. It should return it; the chat loop prints it.")

    c.visible("ask(question, messages) handles one question and returns the answer", ask_function, scenario())

    def short_loop(run):
        session = session_of(run)
        need(run.called("ask") == 2, f"The chat loop should call `ask` once per question; it was called {run.called('ask')} time(s) for two questions.")
        need(run.called("call_claude") == len(session.calls) == 3, f"Every request should go through `call_claude`: {run.called('call_claude')} call(s) for {len(session.calls)} request(s).")
        need(run.called("run_tool") == 1, f"`run_tool` should run once for the one tool request; it ran {run.called('run_tool')} time(s).")
        answers = agent_lines(run)
        need(any("The balance reads " + READING in line for line in answers) and any("Hello" in line for line in answers), f"Both answers should be printed after `Agent:`; printed {answers}.")

    c.visible("The chat loop only reads, calls ask, and prints", short_loop, scenario("please weigh the sample", "hello"), "Each function has one job")
    prompt_cases(c)
    connection_cases(c)
    failure_cases(c)
    round_trip_cases(c)
    loop_cases(c)
