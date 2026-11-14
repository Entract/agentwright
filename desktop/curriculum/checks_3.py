"""Module 3: tool execution and dispatch. Executable versions of the manifest's acceptance checks."""
from labcheck import (
    Fail, balance, checks, expect_lines, need, no_crash, printed_values, temperature, text, tool, uses_any, with_response,
)

BOTH = [text("I'll check the instruments."), tool("toolu_1", "read_balance", {"balance_id": "XPR205"}), tool("toolu_2", "check_temperature", {"sensor_id": "TEMP02"})]


def printed_dicts(run):
    return [v for v in printed_values(run) if isinstance(v, dict)]


def expect_printed(run, expected, what):
    no_crash(run)
    actual = printed_dicts(run)
    if actual == expected:
        return
    if not actual and run.lines():
        raise Fail(f"{what}: expected the tool's returned dictionary to be printed, but the output was {run.lines()[:3]}. Print what the function returns, not the request.")
    if not actual:
        raise Fail(f"{what}: nothing was printed. Is the tool's result printed inside the matching branch?")
    raise Fail(f"{what}: printed {actual}, expected {expected}.")


def calls_once(run, name, count=1):
    actual = run.called(name)
    need(actual == count, f"`{name}` was called {actual} time(s); expected {count}. Each requested tool should run once, and only when it is requested.")


@checks("3A")
def _(c):
    def default(run):
        expect_printed(run, [balance()], "With the balance request")
        calls_once(run, "read_balance")

    c.visible("The balance request is executed and its result printed", default)

    def other_id(run):
        expect_printed(run, [balance("AB104")], "With a different balance ID")

    c.hidden("A different balance ID in the request", other_id, with_response([tool("toolu_x", "read_balance", {"balance_id": "AB104"})]), "The ID comes from block.input, not from your code")

    def no_match(run):
        no_crash(run)
        calls_once(run, "read_balance", 0)
        need(not printed_dicts(run), "Nothing should be printed when read_balance is not requested.")

    c.hidden("A response that does not ask for read_balance", no_match, with_response([text("Nothing to do."), tool("toolu_t", "check_temperature", {"sensor_id": "TEMP02"})]), "The tool runs only for a matching request")

    def text_first(run):
        expect_printed(run, [balance()], "With a text block before the tool request")

    c.hidden("A text block comes before the tool request", text_first, with_response([text("Reading now."), tool("toolu_b", "read_balance", {"balance_id": "XPR205"})]), "Filter on block.type before reading tool fields")


@checks("3B")
def _(c):
    def default(run):
        expect_printed(run, [balance(), temperature()], "With both requests")
        calls_once(run, "read_balance")
        calls_once(run, "check_temperature")

    c.visible("Both requested tools run and both results are printed", default)

    def only_balance(run):
        expect_printed(run, [balance()], "With only a balance request")
        calls_once(run, "check_temperature", 0)

    c.hidden("Only read_balance is requested", only_balance, with_response([tool("toolu_1", "read_balance", {"balance_id": "XPR205"})]), "A function runs only inside its matching branch")

    def only_temperature(run):
        expect_printed(run, [temperature("TEMP09")], "With only a temperature request")
        calls_once(run, "read_balance", 0)

    c.hidden("Only check_temperature is requested", only_temperature, with_response([tool("toolu_9", "check_temperature", {"sensor_id": "TEMP09"})]), "A function runs only inside its matching branch")

    def reversed_order(run):
        expect_printed(run, [temperature(), balance()], "With the requests in the other order")

    c.hidden("The two requests arrive in the other order", reversed_order, with_response([BOTH[2], BOTH[1]]), "Results follow the order of the requests")

    def text_only(run):
        no_crash(run)
        need(run.called("read_balance") + run.called("check_temperature") == 0, "With no tool requests, neither instrument should be called.")

    c.hidden("A response with only text", text_only, with_response([text("All done.")], "end_turn"), "A text block has no name or input")


@checks("3C")
def _(c):
    def results_of(run):
        no_crash(run)
        results = run.get("results", "a list")
        need(isinstance(results, list), f"`results` should be a list, but it is {type(results).__name__}.")
        return results

    def default(run):
        results = results_of(run)
        need(results == [balance(), temperature()], f"`results` is {results}; expected the two returned dictionaries, balance first then temperature.")
        calls_once(run, "read_balance")
        calls_once(run, "check_temperature")

    c.visible("`results` holds both returned dictionaries, in request order", default)

    def printed_once(run):
        results = results_of(run)
        lines = run.lines()
        need(len(lines) == 1, f"Expected one printed line (the whole list, after the loop), but {len(lines)} line(s) were printed. Printing inside the branches is what this exercise replaces.")
        need(printed_values(run) == [results], f"The printed line should be the `results` list itself; it was {lines[0][:120]!r}.")

    c.visible("The list is printed once, after the loop", printed_once, concept="print shows text on screen; append keeps the value for later")

    def one_call(run):
        results = results_of(run)
        need(results == [balance("AB104")], f"With one tool request, `results` is {results}; expected one dictionary for that request.")
        calls_once(run, "check_temperature", 0)

    c.hidden("A response with a single tool request", one_call, with_response([text("One reading."), tool("toolu_7", "read_balance", {"balance_id": "AB104"})]), "One result per tool_use block")

    def reversed_order(run):
        results = results_of(run)
        need(results == [temperature(), balance()], f"With the requests in the other order, `results` is {results}; the order should follow the requests.")

    c.hidden("The requests arrive in the other order", reversed_order, with_response([BOTH[2], BOTH[1]]), "Append as each block is handled")

    def text_only(run):
        results = results_of(run)
        need(results == [], f"With no tool requests `results` should stay empty, but it is {results}. Text blocks are not results.")

    c.hidden("A response with only text", text_only, with_response([text("Nothing to measure.")], "end_turn"), "Only tool_use blocks produce results")


@checks("3D")
def _(c):
    def known(run):
        no_crash(run)
        need(run.call("execute_tool", "read_balance", {"balance_id": "XPR205"}) == balance(), "`execute_tool(\"read_balance\", {\"balance_id\": \"XPR205\"})` should return the balance reading.")

    c.visible("A known balance request returns the measurement", known)

    def known_temperature(run):
        no_crash(run)
        got = run.call("execute_tool", "check_temperature", {"sensor_id": "TEMP07"})
        need(got == temperature("TEMP07"), f"`execute_tool(\"check_temperature\", ...)` returned {got!r}; expected the temperature reading for that sensor.")

    c.hidden("A known temperature request", known_temperature, concept="Each name routes to its own function with its own argument key")

    def unknown(run):
        no_crash(run)
        before = run.called("read_balance") + run.called("check_temperature")
        got = run.call("execute_tool", "open_door", {"door": 1})
        need(isinstance(got, dict) and "error" in got, f"An unknown tool name should return a dictionary with an \"error\" key; got {got!r}.")
        need(run.called("read_balance") + run.called("check_temperature") == before, "An unknown tool name must not run any instrument.")

    c.hidden("An unknown tool name", unknown, concept="Unsupported names get an explicit error result")

    def no_eval(run):
        used = uses_any(run, {"eval", "exec", "globals", "locals", "getattr", "__import__"})
        need(not used, f"The dispatcher uses {', '.join(used)}. Route with explicit if/elif (or a dictionary of allowed functions) so that only known tools can ever run.")

    c.hidden("Only allowlisted functions can run", no_eval, concept="Never execute a function chosen by an arbitrary string")

    def not_named_tool(run):
        no_crash(run)
        got = run.call("execute_tool", "print", {"balance_id": "XPR205"})
        need(isinstance(got, dict) and "error" in got, f"A name that happens to be a Python built-in should also give an error result; got {got!r}.")

    c.hidden("A name that is not one of the two tools", not_named_tool, concept="An allowlist, not a lookup of any existing function")


@checks("3E")
def _(c):
    def records(run):
        no_crash(run)
        executions = run.get("executions", "a list")
        need(isinstance(executions, list), "`executions` should be a list.")
        for record in executions:
            need(isinstance(record, dict) and {"id", "name", "result"} <= set(record), f"Each record needs the keys id, name and result; got {record!r}.")
        return executions

    def default(run):
        got = records(run)
        expected = [{"id": "toolu_1", "name": "read_balance", "result": balance()}, {"id": "toolu_2", "name": "check_temperature", "result": temperature()}]
        need([{k: r[k] for k in ("id", "name", "result")} for r in got] == expected, f"`executions` is {got}; expected one record per tool request with its id, name and result.")

    c.visible("Two records, in request order, with ids preserved", default)

    def other_ids(run):
        got = records(run)
        need([r["id"] for r in got] == ["toolu_b9", "toolu_a3"], f"The record ids were {[r['id'] for r in got]}; they should be each block's own id, in request order.")
        need([r["result"] for r in got] == [temperature("TEMP05"), balance("AB104")], "Each record's result should come from executing that block's request.")

    c.hidden("Different ids and order", other_ids, with_response([tool("toolu_b9", "check_temperature", {"sensor_id": "TEMP05"}), text("and"), tool("toolu_a3", "read_balance", {"balance_id": "AB104"})]), "block.id travels with the result")

    def text_only(run):
        need(records(run) == [], "With no tool requests, `executions` should stay empty.")

    c.hidden("A response with only text", text_only, with_response([text("Done.")], "end_turn"), "Text blocks are not executions")

    def uses_helper(run):
        records(run)
        need(run.called("execute_tool") == 2, f"`execute_tool` was called {run.called('execute_tool')} time(s); reuse it once per tool request.")

    c.hidden("The helper is called once per request", uses_helper, concept="Reuse the dispatcher instead of repeating its branches")


@checks("3F")
def _(c):
    c.options(explanation=[
        {"point": "Says the schema describes the arguments Claude should send (names or types)", "any": [["argument"], ["input"], ["parameter"], ["type"], ["key"]]},
        {"point": "Separates the schema from running the tool or from its result", "any": [["not", "run"], ["not", "execute"], ["not", "result"], ["describe"], ["contract"], ["before"]]},
    ])

    def default(run):
        expect_lines(run, ["balance_id"])

    c.visible("The required argument key of read_balance is printed", default)

    def other_schema(run):
        expect_lines(run, ["scale_id"], "With a different schema, the output")

    def setup(ns):
        ns["tools"] = [{"name": "read_balance", "description": "x", "input_schema": {"type": "object", "properties": {"scale_id": {"type": "string"}}, "required": ["scale_id"]}}]

    c.hidden("The key is read from the schema, not typed in", other_schema, setup, "Navigate tools -> input_schema -> required")


@checks("3G")
def _(c):
    def valid(run):
        no_crash(run)
        # Counted from here: the learner's own trial calls below the function are allowed.
        before = run.called("read_balance")
        need(run.call("safe_read_balance", {"balance_id": "XPR205"}) == balance(), "Valid arguments should return the balance reading.")
        need(run.called("read_balance") == before + 1, "Valid arguments should call read_balance exactly once.")

    c.visible("Valid arguments return the reading", valid)

    def expect_error(args, message, label):
        def check(run):
            no_crash(run)
            before = run.called("read_balance")
            got = run.call("safe_read_balance", args)
            need(got == {"error": message}, f"For {label}, expected {{'error': '{message}'}} but got {got!r}.")
            need(run.called("read_balance") == before, f"For {label}, the instrument must not be called.")

        return check

    c.visible("A missing balance_id is reported", expect_error({}, "missing balance_id", "arguments with no balance_id"), concept="Check the key exists before using it")
    c.hidden("A balance_id that is a number", expect_error({"balance_id": 7}, "invalid balance_id", "a balance_id that is not a string"), concept="isinstance(value, str)")
    c.hidden("An empty balance_id", expect_error({"balance_id": ""}, "invalid balance_id", "an empty balance_id"), concept="A string can be present but empty")
