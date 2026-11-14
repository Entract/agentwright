"""Module 8: evaluation and verification.

These exercises ask the learner to write tests. The checks therefore do two things: run the
learner's tests against the real code (they must pass), and against deliberately broken code
(they must then fail). A test that cannot fail proves nothing.
"""
import ast

from checks_6 import valid_history
from labcheck import Fail, balance, checks, need, no_crash, plain, temperature, with_values


def count_asserts(run):
    try:
        return sum(1 for node in ast.walk(ast.parse(run.source)) if isinstance(node, ast.Assert))
    except SyntaxError:
        return 0


def expect_assertion_failure(run, label):
    """The learner's own assertions must catch this deliberately broken version."""
    if run.error and run.error["type"] == "AssertionError":
        return
    if run.error:
        raise Fail(f"{label}: your program stopped with {run.error['type']} rather than a failed assert: {run.error['message'][:120]}")
    raise Fail(f"{label}: all your assertions still passed. At least one of them should fail here.")


@checks("8A")
def _(c):
    def default(run):
        no_crash(run)
        need(count_asserts(run) >= 3, f"The program has {count_asserts(run)} assert statement(s); the task asks for three: the ID, the mass and the unit.")

    c.visible("Three assertions pass for a correct reading", default, concept="assert condition: silent when true, an error when false")

    def broken(**changes):
        def setup(ns):
            def read_balance(balance_id):
                reading = {"balance_id": balance_id, "mass": 10.52, "unit": "g"}
                reading.update(changes)
                return reading

            ns["read_balance"] = read_balance

        return setup

    c.hidden("A reading that reports the wrong balance", lambda run: expect_assertion_failure(run, "When the instrument returns a different balance_id"), broken(balance_id="OTHER01"), "Check the ID that came back against the one you asked for")
    c.hidden("A reading whose mass is text", lambda run: expect_assertion_failure(run, "When the mass comes back as the string \"10.52\""), broken(mass="10.52"), "isinstance(value, (int, float)) checks the type")
    c.hidden("A reading in the wrong unit", lambda run: expect_assertion_failure(run, "When the unit comes back as \"mg\""), broken(unit="mg"), "Compare the unit with \"g\"")


@checks("8B")
def _(c):
    def default(run):
        no_crash(run)
        seen = [list(args[0]) for args, _ in run.calls.get("count_high", []) if args]
        for values in ([], [11], [12, 13]):
            need(values in seen, f"`count_high` was never called with {values}; loop over every case in `tests`.")
        need(count_asserts(run) >= 1, "Use an assert inside the loop to compare each result with its expected value.")

    c.visible("Every case in the table is checked and passes", default, concept="for values, expected in tests")

    def broken(fn):
        return with_values(count_high=fn)

    def includes_eleven(measurements):
        return sum(1 for v in measurements if v >= 11)

    def always_zero(measurements):
        return 0

    def counts_everything(measurements):
        return len(measurements)

    c.hidden("A count_high that includes exactly 11", lambda run: expect_assertion_failure(run, "With a count_high that counts values equal to 11"), broken(includes_eleven), "The boundary case ([11], 0) exists to catch this")
    c.hidden("A count_high that always returns 0", lambda run: expect_assertion_failure(run, "With a count_high that always returns 0"), broken(always_zero), "A case with a non-zero answer is needed")
    c.hidden("A count_high that counts every value", lambda run: expect_assertion_failure(run, "With a count_high that returns the list length"), broken(counts_everything), "Compare with the expected value, not just the type")


PROVIDED_8C = '''def execute_tool(name, args):
    """The dispatcher under evaluation. Known tools return readings; anything else returns {"error": ...}."""
    if name == "read_balance":
        if "balance_id" not in args:
            return {"error": "missing balance_id"}
        return read_balance(args["balance_id"])
    if name == "check_temperature":
        if "sensor_id" not in args:
            return {"error": "missing sensor_id"}
        return check_temperature(args["sensor_id"])
    return {"error": "unknown tool: " + name}
'''

NOTE_8C = (
    "In this app: `execute_tool` is provided below. For each of the four cases decide what a correct dispatcher should return, run it, and append "
    "`{\"case\": <tool name>, \"passed\": True or False}` to a list `records`. If `execute_tool` raises for a case, record that case as failed instead of letting "
    "the evaluation stop. Finish by printing how many cases passed (a single number)."
)


@checks("8C")
def _(c):
    c.options(note=NOTE_8C, extra_fixtures={"execute_tool": PROVIDED_8C})

    def records_of(run):
        no_crash(run)
        records = run.get("records", "a list")
        need(isinstance(records, list) and len(records) == 4, f"`records` should hold one entry per case (4); it has {len(records) if isinstance(records, list) else type(records).__name__}.")
        for record in records:
            need(isinstance(record, dict) and isinstance(record.get("passed"), bool), f"Each record needs a Boolean \"passed\"; got {record!r}.")
        return [r["passed"] for r in records]

    def printed_count(run):
        numbers = [line for line in run.lines() if line.strip().isdigit()]
        need(numbers, f"Print the number of cases that passed; the output was {run.lines()[-2:]}.")
        return int(numbers[-1])

    def default(run):
        passed = records_of(run)
        need(passed == [True, True, True, True], f"With the provided dispatcher every case should pass, but the records are {passed}. Check what you expect for the two error cases: a dictionary with an \"error\" key.")
        need(printed_count(run) == 4, f"The printed pass count is {printed_count(run)}; expected 4.")
        need(run.called("execute_tool") == 4, f"`execute_tool` was called {run.called('execute_tool')} time(s); expected once per case (4).")

    c.visible("All four cases run and pass against the provided dispatcher", default)

    def broken(fn):
        def setup(ns):
            original = {"read_balance": ns["read_balance"], "check_temperature": ns["check_temperature"]}
            ns["execute_tool"] = lambda name, args: fn(name, args, original)

        return setup

    def accepts_unknown(name, args, tools):
        if name == "check_temperature":
            return tools["check_temperature"](args["sensor_id"])
        return tools["read_balance"](args.get("balance_id", "XPR205"))

    def wrong_mass(name, args, tools):
        if name == "read_balance" and "balance_id" in args:
            return {"balance_id": args["balance_id"], "mass": 0.0, "unit": "g"}
        if name == "check_temperature" and "sensor_id" in args:
            return tools["check_temperature"](args["sensor_id"])
        return {"error": "bad request"}

    def raises_on_missing(name, args, tools):
        if name == "read_balance":
            return tools["read_balance"](args["balance_id"])
        if name == "check_temperature":
            return tools["check_temperature"](args["sensor_id"])
        return {"error": "unknown tool: " + name}

    def expect_pattern(wanted, label, concept_note):
        def check(run):
            passed = records_of(run)
            need(passed == wanted, f"{label}, the records are {passed}; expected {wanted}. {concept_note}")
            need(printed_count(run) == sum(wanted), f"{label}, the printed pass count is {printed_count(run)}; expected {sum(wanted)}.")

        return check

    c.hidden(
        "A dispatcher that runs a balance for unknown or incomplete requests",
        expect_pattern([True, True, False, False], "With a dispatcher that returns a reading for the two error cases", "The error cases must expect an error result."),
        broken(accepts_unknown),
        "Failure cases need their own expectation",
    )
    c.hidden(
        "A dispatcher that returns the wrong mass",
        expect_pattern([False, True, True, True], "With a dispatcher whose balance reading has mass 0.0", "The normal cases must check the values, not only that something came back."),
        broken(wrong_mass),
        "Compare the result with the expected reading",
    )
    c.hidden(
        "A dispatcher that raises on a missing argument",
        expect_pattern([True, True, True, False], "With a dispatcher that raises KeyError for the last case", "Catch the exception and record that case as failed."),
        broken(raises_on_missing),
        "An evaluation must survive the failures it is looking for",
    )


@checks("8D")
def _(c):
    def tool_use(*ids):
        return {"role": "assistant", "content": [{"type": "tool_use", "id": i, "name": "read_balance", "input": {"balance_id": "XPR205"}} for i in ids]}

    def results(*ids):
        return {"role": "user", "content": [{"type": "tool_result", "tool_use_id": i, "content": "{}"} for i in ids]}

    start = {"role": "user", "content": "Check balance"}

    def verdict(run, messages, label):
        got = run.call("validate_history", messages)
        if isinstance(got, tuple) and got:
            got = got[0]
        need(isinstance(got, bool), f"{label}: `validate_history` should return True or False (or a pair starting with one); it returned {type(got).__name__}.")
        return got

    def expect(messages, wanted, label, why):
        def check(run):
            no_crash(run)
            got = verdict(run, messages, label)
            need(got is wanted, f"{label}: `validate_history` returned {got}; expected {wanted}. {why}")

        return check

    def fixture_valid(run):
        no_crash(run)
        need(verdict(run, run.ns["messages"], "For the valid history") is True, "The valid history on the left should be accepted.")

    c.visible("The valid history is accepted", fixture_valid)
    c.visible("A request with no result is rejected", expect([start, tool_use("toolu_bal")], False, "For a history that ends with an unanswered tool request", "Every requested id needs a result."), concept="Each tool_use id needs exactly one tool_result")
    c.hidden("A text message between request and result", expect([start, tool_use("toolu_bal"), {"role": "user", "content": "Thanks, please continue"}, results("toolu_bal")], False, "For a history with a user text between the request and its result", "The results must come directly after the request."), concept="Adjacency, not just presence")
    c.hidden("A result for an id that was never requested", expect([start, tool_use("toolu_bal"), results("toolu_other")], False, "For a result whose id matches no request", "Result ids must be ones that were requested."), concept="Compare the two sets of ids")
    c.hidden("The same result twice", expect([start, tool_use("toolu_bal"), results("toolu_bal", "toolu_bal")], False, "For a history that answers one request twice", "Each request gets one result, not two."), concept="Count, do not just test membership")
    c.hidden("Two requests, one result", expect([start, tool_use("toolu_1", "toolu_2"), results("toolu_1")], False, "For two requests with only one result", "Every id in the turn needs its result."), concept="Parallel requests are all answered together")
    c.hidden("Two complete tool turns", expect([start, tool_use("toolu_1", "toolu_2"), results("toolu_1", "toolu_2"), tool_use("toolu_3"), results("toolu_3"), {"role": "assistant", "content": "Done."}], True, "For a longer, correct history", "A valid multi-turn history must be accepted."), concept="The rule applies turn by turn")
    c.hidden("A conversation with no tools", expect([start, {"role": "assistant", "content": "Hello."}], True, "For a history with no tool use at all", "Content can be a plain string."), concept="Content is sometimes a string, not a list")


NOTE_8E = (
    "In this app: call `flaky_read_balance(\"XPR205\")` exactly four times through a safe wrapper of your own, appending one record per call to a list `records`: "
    "`{\"is_error\": False, \"content\": <the reading>}` or `{\"is_error\": True, \"content\": <the error message>}`. Do not retry a failed call. "
    "Then write assertions for the pattern you expect (success, error, success, error) and print `records`."
)


@checks("8E")
def _(c):
    c.options(note=NOTE_8E)

    def records_of(run):
        no_crash(run)
        records = run.get("records", "a list")
        need(isinstance(records, list), "`records` should be a list.")
        for record in records:
            need(isinstance(record, dict) and isinstance(record.get("is_error"), bool), f"Each record needs a Boolean \"is_error\"; got {record!r}.")
        return records

    def default(run):
        records = records_of(run)
        need(len(records) == 4, f"`records` has {len(records)} entr(y/ies); expected one per call (4).")
        need([r["is_error"] for r in records] == [False, True, False, True], f"The is_error pattern is {[r['is_error'] for r in records]}; this instrument fails on every second call, so expected [False, True, False, True].")
        need(plain(records[0].get("content")) == balance(), f"A successful record should keep the reading as content; got {records[0].get('content')!r}.")
        need(isinstance(records[1].get("content"), str) and "simulated sensor timeout" in records[1]["content"], f"An error record should carry the error message; got {records[1].get('content')!r}.")

    c.visible("Four calls give success, error, success, error", default)

    def no_retry(run):
        records_of(run)
        need(run.called("flaky_read_balance") == 4, f"`flaky_read_balance` was called {run.called('flaky_read_balance')} time(s); expected exactly 4. A failed call must be recorded, not retried silently.")
        need(count_asserts(run) >= 2, f"The program has {count_asserts(run)} assert statement(s); assert both a success and an error.")

    c.visible("No hidden retries, and the pattern is asserted", no_retry, concept="Deterministic fakes make failures testable")

    def fails_first(ns):
        state = {"calls": 0}

        def flaky_read_balance(balance_id):
            state["calls"] += 1
            if state["calls"] % 2 == 1:
                raise RuntimeError("simulated sensor timeout")
            return {"balance_id": balance_id, "mass": 10.52, "unit": "g"}

        ns["flaky_read_balance"] = flaky_read_balance

    c.hidden("An instrument that fails on the odd calls instead", lambda run: expect_assertion_failure(run, "With an instrument that fails on calls 1 and 3"), fails_first, "Your assertions should notice when the pattern changes")

    def never_fails(ns):
        ns["flaky_read_balance"] = lambda balance_id: {"balance_id": balance_id, "mass": 10.52, "unit": "g"}

    c.hidden("An instrument that never fails", lambda run: expect_assertion_failure(run, "With an instrument that never fails"), never_fails, "The error path must be asserted, not assumed")


NOTE_8F = (
    "In this app: write your diagnosis in the explanation box: the cause, how to reproduce it, the smallest fix and a regression test you would add. "
    "In code, build `fixed_messages`: the same assistant request, tool result and \"Thanks, please continue\" text from the trace, in an order the API accepts."
)


@checks("8F")
def _(c):
    c.options(
        note=NOTE_8F,
        explanation=[
            {"point": "Names the cause: a message sits between the tool request and its result", "any": [["between"], ["interrupt"], ["immediately"], ["directly", "after"], ["adjacen"], ["order"]]},
            {"point": "Separates the symptom (the API error) from the cause", "any": [["cause"], ["because"], ["symptom"]]},
            {"point": "Says how to reproduce it", "any": [["reproduc"], ["steps"], ["send"]]},
            {"point": "Proposes a regression test", "any": [["test"], ["assert"], ["regression"]]},
        ],
    )

    def fixed(run):
        no_crash(run)
        messages = [plain(m) for m in run.get("fixed_messages", "the corrected history")]
        need(isinstance(messages, list) and messages, "`fixed_messages` should be a non-empty list of messages.")
        return messages

    def default(run):
        messages = fixed(run)
        problem = valid_history(messages)
        need(problem is None, f"`fixed_messages` is still not valid: {problem}.")
        requests = [(i, b) for i, m in enumerate(messages) if m.get("role") == "assistant" and isinstance(m.get("content"), list) for b in m["content"] if isinstance(b, dict) and b.get("type") == "tool_use"]
        need(len(requests) == 1 and requests[0][1].get("id") == "toolu_1" and requests[0][1].get("name") == "read_balance", "Keep the assistant's original request: one tool_use block with id toolu_1 for read_balance.")

    c.visible("The corrected history is valid and keeps the original request", default, concept="The result must directly follow the request")

    def minimal(run):
        messages = fixed(run)
        flat = str(messages)
        need("Thanks, please continue" in flat, "The user's text \"Thanks, please continue\" should still be in the history. The smallest fix moves it; it does not delete it.")
        need("10.52 g" in flat, "Keep the tool result's content (\"10.52 g\") as it was.")
        index = next(i for i, m in enumerate(messages) if m.get("role") == "assistant" and isinstance(m.get("content"), list))
        need(index + 1 < len(messages) and isinstance(messages[index + 1].get("content"), list) and messages[index + 1]["content"], "The message right after the request should be the user message holding the tool_result.")
        first = messages[index + 1]["content"][0]
        need(isinstance(first, dict) and first.get("type") == "tool_result" and first.get("tool_use_id") == "toolu_1", "The message right after the request should begin with the tool_result for toolu_1.")

    c.hidden("Nothing is lost: the text and the result content are kept", minimal, concept="A minimal fix changes order, not content")
