"""Module 9: timed projects. Multi-file workspaces, checked by importing the learner's modules."""
import ast
import json

from checks_6 import valid_history
from labcheck import Fail, balance, checks, need, plain, sdk_message, temperature, text, tool
from workspaces_9 import EVAL_CASES_9C, EVALUATE_9C, NOTE_9A, NOTE_9B, NOTE_9C, WORKSPACE_9A, WORKSPACE_9B, WORKSPACE_9C

TOOL_OUTPUT = {"read_balance": lambda i: balance(i["balance_id"]), "check_temperature": lambda i: temperature(i["sensor_id"])}


def snapshot(messages):
    copy = []
    for m in messages:
        content = m["content"] if isinstance(m, dict) else None
        copy.append({"role": m.get("role") if isinstance(m, dict) else None, "content": list(content) if isinstance(content, list) else content})
    return copy


class Scripted:
    """The checker's own fake client, so the tests do not depend on files the learner can edit."""

    def __init__(self, responses, with_tools=False):
        self.responses = list(responses)
        self.calls = []
        self.tools = []
        self.with_tools = with_tools

    def create(self, messages, tools=None):
        self.calls.append(snapshot(messages))
        self.tools.append(tools)
        return self.responses[min(len(self.calls), len(self.responses)) - 1]


def final(*parts):
    return sdk_message([text(p) for p in parts], "end_turn", "msg_final")


def test_functions(source):
    try:
        return [n.name for n in ast.walk(ast.parse(source)) if isinstance(n, ast.FunctionDef) and n.name.startswith("test_")]
    except SyntaxError:
        return []


def own_tests_pass(run, baseline_count, extra_needed, must_mention=None):
    """The learner's test file must run clean, and (for some mocks) contain a test they added."""
    if run.error:
        raise Fail(f"Running the project stopped with {run.error['type']}: {run.error['message'][:160]}")
    bad = [line for line in run.lines() if line.startswith(("FAIL", "ERROR"))]
    if bad:
        raise Fail(f"Your own test file still reports: {bad[0][:160]}")
    names = test_functions(run.files.get("test_agent.py", ""))
    if extra_needed:
        need(len(names) >= baseline_count + extra_needed, f"`test_agent.py` has {len(names)} test function(s); the project started with {baseline_count}. Add at least one regression test of your own (a function named test_...).")
    if must_mention:
        need(must_mention in run.files.get("test_agent.py", ""), f"None of your tests mention `{must_mention}`.")


def expect_results(message, requests, label):
    need(isinstance(message, dict) and message.get("role") == "user" and isinstance(message.get("content"), list), f"{label}: the last message sent should be one user message holding the tool results.")
    results = [plain(b) for b in message["content"]]
    wanted = [b for b in requests if b["type"] == "tool_use"]
    ids = [r.get("tool_use_id") for r in results]
    need(ids == [b["id"] for b in wanted], f"{label}: the tool results answer {ids}; expected one result for each request, in order: {[b['id'] for b in wanted]}.")
    for request, result in zip(wanted, results):
        if request["name"] in TOOL_OUTPUT:
            got = json.loads(result["content"]) if isinstance(result.get("content"), str) else result.get("content")
            need(got == TOOL_OUTPUT[request["name"]](request["input"]), f"{label}: the result for {request['id']} is {got!r}, which is not that tool's output.")


# --------------------------------------------------------------------------- 9A

TWO = [text("I'll check both instruments."), tool("toolu_1", "read_balance", {"balance_id": "XPR205"}), tool("toolu_2", "check_temperature", {"sensor_id": "TEMP02"})]
ONE = [tool("toolu_9", "read_balance", {"balance_id": "AB104"})]


@checks("9A")
def _(c):
    c.options(
        files=WORKSPACE_9A,
        entry="test_agent.py",
        note=NOTE_9A,
        explanation=[
            {"point": "Describes the order: Claude's request, then the tools run, then one message with the results, then the next call", "any": [["assistant", "user"], ["request", "result"], ["then"]]},
            {"point": "Says both results go back together in one user message", "any": [["one", "message"], ["single", "message"], ["together"], ["batch"], ["both"]]},
            {"point": "Says the model is called again once, after all results are collected", "any": [["after"], ["once"], ["outside", "loop"]]},
        ],
    )

    def agent_run(run, responses, question="Read the instruments."):
        agent = run.module("agent")
        need(hasattr(agent, "run_agent"), "`agent.py` should still define `run_agent(client, user_text)`.")
        client = Scripted(responses)
        answer = run.invoke(agent.run_agent, client, question)
        return client, answer

    def two_tools(run):
        client, answer = agent_run(run, [sdk_message(TWO), final("The balance reads 10.52 g and the room is at 22.4 C.")])
        need(len(client.calls) == 2, f"With two tool requests in one turn the model was called {len(client.calls)} time(s); expected 2 (the request, then one continuation after both results).")
        history = client.calls[1]
        need(len(history) == 3, f"On the second call the history had {len(history)} message(s); expected 3: the question, Claude's request, one message of results.")
        expect_results(history[-1], TWO, "With two tool requests")
        need(isinstance(answer, str) and "10.52" in answer, f"`run_agent` returned {answer!r}; expected the final text.")

    c.visible("Two tools in one turn: both results in one message, one continuation call", two_tools, concept="Collect the whole batch, then call the model once")

    def single(run):
        client, answer = agent_run(run, [sdk_message(ONE), final("AB104 reads 10.52 g.")])
        need(len(client.calls) == 2, f"With one tool request the model was called {len(client.calls)} time(s); expected 2.")
        expect_results(client.calls[1][-1], ONE, "With one tool request")
        need(answer == "AB104 reads 10.52 g.", f"`run_agent` returned {answer!r}.")

    c.visible("A single tool request still works", single, concept="A fix must not break what already worked")

    def mixed_final(run):
        _, answer = agent_run(run, [final("The balance reads 10.52 g.", "The room is at 22.4 C.")])
        need(isinstance(answer, str) and "10.52" in answer and "22.4" in answer, f"For a final answer in two text blocks `run_agent` returned {answer!r}; both parts should be there.")
        need(answer.index("10.52") < answer.index("22.4"), "The text blocks should stay in their original order.")

    c.visible("A final answer in two text blocks is returned whole", mixed_final, concept="Gather every text block; do not assume which is last")

    def three_tools(run):
        blocks = [tool("toolu_a", "check_temperature", {"sensor_id": "TEMP05"}), tool("toolu_b", "read_balance", {"balance_id": "XPR205"}), text("and"), tool("toolu_c", "read_balance", {"balance_id": "AB104"})]
        client, _ = agent_run(run, [sdk_message(blocks), final("Done.")])
        need(len(client.calls) == 2, f"With three tool requests the model was called {len(client.calls)} time(s); expected 2.")
        expect_results(client.calls[1][-1], blocks, "With three tool requests")

    c.hidden("Three tool requests in one turn", three_tools, concept="The same code handles any number of requests")

    def two_rounds(run):
        second = [tool("toolu_r2", "check_temperature", {"sensor_id": "TEMP02"})]
        client, answer = agent_run(run, [sdk_message(ONE), sdk_message(second), final("All read.")])
        need(len(client.calls) == 3, f"With two tool rounds the model was called {len(client.calls)} time(s); expected 3.")
        need(len(client.calls[2]) == 5, f"By the third call the history had {len(client.calls[2])} message(s); expected 5, with no duplicates.")
        problem = valid_history(client.calls[2])
        need(problem is None, f"The history sent on the third call is not valid: {problem}.")
        expect_results(client.calls[2][-1], second, "In the second round")
        need(answer == "All read.", f"`run_agent` returned {answer!r}.")

    c.hidden("Two tool rounds, one after the other", two_rounds, concept="Each round adds exactly two messages")

    def last_not_text(run):
        odd = sdk_message([text("Reading stopped early."), tool("toolu_x", "read_balance", {"balance_id": "XPR205"})], "max_tokens", "msg_cut")
        _, answer = agent_run(run, [odd])
        need(isinstance(answer, str) and "Reading stopped early." in answer, f"When the last content block is not text, `run_agent` returned {answer!r}; it should return the text that is there.")

    c.hidden("A final response whose last block is not text", last_not_text, concept="Filter by block.type instead of indexing from the end")

    c.hidden("Your tests pass and include a regression test of your own", lambda run: own_tests_pass(run, 3, 1), concept="A regression test fails before the fix and passes after")


# --------------------------------------------------------------------------- 9B


@checks("9B")
def _(c):
    c.options(
        files=WORKSPACE_9B,
        entry="test_agent.py",
        note=NOTE_9B,
        explanation=[
            {"point": "Explains how invalid input is handled", "any": [["invalid"], ["valid"], ["error"], ["reject"]]},
            {"point": "Mentions keeping the existing tools working", "any": [["existing"], ["regress"], ["still work"], ["backward"], ["unchanged"]]},
            {"point": "States a trade-off or something left out", "any": [["trade"], ["instead"], ["did not"], ["chose"], ["would"], ["time"]]},
        ],
    )

    def stability(run, args):
        tools = run.module("tools")
        got = run.invoke(tools.execute_tool, "check_stability", args)
        need(isinstance(got, dict), f"`execute_tool(\"check_stability\", {args})` returned {type(got).__name__}; expected a dictionary.")
        return got

    def stable(run):
        got = stability(run, {"masses": [10.52, 10.53, 10.52]})
        need("error" not in got, f"Three close readings gave an error result: {got}. Is `check_stability` allowlisted in `execute_tool`?")
        need(got.get("stable") is True, f"Readings within 0.01 g should be stable; got {got}.")
        need(isinstance(got.get("range"), (int, float)) and abs(got["range"] - 0.01) < 1e-6, f"The range for [10.52, 10.53, 10.52] should be 0.01 (max - min); got {got.get('range')!r}.")

    c.visible("Three close readings are stable, with their range", stable)

    def unstable(run):
        got = stability(run, {"masses": [10.00, 10.01, 10.05, 10.02]})
        need(got.get("stable") is False, f"Readings spread over 0.05 g should not be stable; got {got}.")
        need(abs(got.get("range", 0) - 0.05) < 1e-6, f"The range for those readings should be 0.05; got {got.get('range')!r}.")

    c.visible("Readings spread over 0.05 g are not stable", unstable, concept="stable means max - min is at most 0.02")

    def boundary(run):
        got = stability(run, {"masses": [10.50, 10.51, 10.52]})
        need(got.get("stable") is True, f"A range of 0.02 g counts as stable (at most 0.02); got {got}.")
        got = stability(run, {"masses": [10.0, 10.0, 10.03]})
        need(got.get("stable") is False, f"A range of 0.03 g is not stable; got {got}.")

    c.hidden("The 0.02 g boundary", boundary, concept="At most 0.02 includes 0.02 itself")

    def invalid(run):
        for args, label in [({}, "no masses"), ({"masses": [10.5, 10.6]}, "only two readings"), ({"masses": [10.5, "10.6", 10.7]}, "a reading that is text"), ({"masses": "10.5, 10.6, 10.7"}, "masses given as one string"), ({"masses": None}, "masses of None")]:
            got = stability(run, args)
            need("error" in got and "stable" not in got, f"With {label}, `check_stability` returned {got}; expected an error result.")

    c.hidden("Missing, too short or non-numeric masses are rejected", invalid, concept="Validate before computing")

    def existing(run):
        tools = run.module("tools")
        need(run.invoke(tools.execute_tool, "read_balance", {"balance_id": "XPR205"}) == balance(), "`read_balance` no longer returns its reading.")
        need(run.invoke(tools.execute_tool, "check_temperature", {"sensor_id": "TEMP02"}) == temperature(), "`check_temperature` no longer returns its reading.")
        need("error" in run.invoke(tools.execute_tool, "open_door", {}), "An unknown tool should still return an error result.")
        need("error" in run.invoke(tools.execute_tool, "read_balance", {}), "A missing balance_id should still return an error result.")

    c.visible("The two existing tools and their error handling still work", existing, concept="Extending must not regress")

    def schema(run):
        schemas = run.module("schemas")
        names = [t.get("name") for t in schemas.TOOLS]
        need(names[:2] == ["read_balance", "check_temperature"], "The two existing tool definitions should still be in `TOOLS`.")
        need("check_stability" in names, "`schemas.TOOLS` has no definition named check_stability, so the model would never know the tool exists.")
        definition = schemas.TOOLS[names.index("check_stability")]
        need(isinstance(definition.get("description"), str) and len(definition["description"]) > 10, "Give check_stability a description: it is what the model reads to decide when to use the tool.")
        input_schema = definition.get("input_schema", {})
        need(input_schema.get("type") == "object", "The input_schema type should be \"object\".")
        need(input_schema.get("properties", {}).get("masses", {}).get("type") == "array", "The schema should declare `masses` as an array.")
        need("masses" in input_schema.get("required", []), "`masses` should be listed as required.")

    c.hidden("The schema describes check_stability and its masses array", schema, concept="Schema, dispatch and implementation must agree")

    def end_to_end(run):
        agent = run.module("agent")
        request = [tool("toolu_s1", "check_stability", {"masses": [10.52, 10.52, 10.53]}), tool("toolu_s2", "check_stability", {"masses": [1]})]
        client = Scripted([sdk_message(request), final("Stable.")])
        answer = run.invoke(agent.run_agent, client, "Is the balance stable?")
        need(answer == "Stable.", f"`run_agent` returned {answer!r}.")
        need(len(client.calls) == 2, f"The model was called {len(client.calls)} time(s); expected 2.")
        results = [plain(b) for b in client.calls[1][-1]["content"]]
        need([r.get("tool_use_id") for r in results] == ["toolu_s1", "toolu_s2"], "Each check_stability request needs a result with its own id.")
        need(json.loads(results[0]["content"]).get("stable") is True and results[0].get("is_error") is not True, f"The valid request's result should carry the stability reading; got {results[0]}.")
        need(results[1].get("is_error") is True, "The invalid request's result should be marked is_error.")
        sent_tools = client.tools[0] or []
        need(any(t.get("name") == "check_stability" for t in sent_tools), "The agent should send the new tool definition to the model with the others.")

    c.hidden("The agent runs check_stability and returns matching results", end_to_end, concept="A new tool goes through the same result packaging")

    c.hidden("Your tests pass and cover check_stability", lambda run: own_tests_pass(run, 3, 1, "check_stability"), concept="Test the new behaviour and the old")


# --------------------------------------------------------------------------- 9C

PRISTINE_CASES = json.loads(EVAL_CASES_9C)
BASELINE_SCORE = 4


def pristine_run_case():
    """The evaluation as shipped, independent of any edits to the learner's evaluate.py or eval_cases.json."""
    namespace = {"__name__": "pristine_evaluate"}
    exec(compile(EVALUATE_9C, "<pristine evaluate.py>", "exec"), namespace)
    return namespace["run_case"]


def scorecard(run):
    agent = run.module("agent")
    run_case = pristine_run_case()
    rows = []
    for case in PRISTINE_CASES:
        passed, reason = run.invoke(run_case, case, agent)
        rows.append((case["id"], case["name"], passed, reason))
    return rows


@checks("9C")
def _(c):
    c.options(
        files=WORKSPACE_9C,
        entry="evaluate.py",
        note=NOTE_9C,
        explanation=[
            {"point": "Records the baseline score", "any": [["baseline"], ["before"], ["4/10"], ["4 of 10"], ["4 out of"]]},
            {"point": "Compares it with the score afterwards", "any": [["after"], ["now"], ["improved"], ["/10", "to"]]},
            {"point": "Says why that weakness was chosen", "any": [["because"], ["chose"], ["priorit"], ["safety"], ["impact"]]},
            {"point": "Names the risks that remain", "any": [["remain"], ["still"], ["risk"], ["not fixed"], ["left"]]},
        ],
    )

    def evaluation_runs(run):
        if run.error:
            raise Fail(f"Running evaluate.py stopped with {run.error['type']}: {run.error['message'][:160]}")
        rows = [line for line in run.lines() if line.startswith(("PASS", "FAIL"))]
        need(len(rows) == 10, f"The evaluation printed {len(rows)} scenario row(s); all 10 scenarios should still be evaluated.")
        need(any(line.startswith("Score:") and "/10" in line for line in run.lines()), "The evaluation should still print its `Score: N/10` line.")

    c.visible("The evaluation still runs all ten scenarios", evaluation_runs, concept="Measure the same thing before and after")

    def improved(run):
        rows = scorecard(run)
        score = sum(1 for row in rows if row[2])
        need(score > BASELINE_SCORE, f"Against the ten original scenarios the agent scores {score}/10; the baseline was {BASELINE_SCORE}/10. Fix the root cause of at least one failing scenario in `agent.py`.")

    c.visible("The agent passes more of the ten scenarios than the baseline", improved, concept="One substantive, measured improvement")

    def no_regression(run):
        rows = scorecard(run)
        broken = [f"{row[0]} {row[1]} ({row[3]})" for row in rows[:4] if not row[2]]
        if broken:
            raise Fail(f"A scenario that passed at the start now fails: {broken[0]}.")

    c.hidden("The four scenarios that passed at the start still pass", no_regression, concept="An improvement must not break working behaviour")

    def tests_pass(run):
        module = run.module("test_agent")
        for name in test_functions(run.files.get("test_agent.py", "")):
            try:
                run.invoke(getattr(module, name))
            except Fail as failure:
                raise Fail(f"Your test `{name}` does not pass: {failure}") from None

    c.hidden("The quick tests in test_agent.py pass", tests_pass, concept="Keep the fast checks green")
