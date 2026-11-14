"""Module 1: Python execution and functions."""
from labcheck import checks, expect_lines, need, no_crash, with_values


def fmt(values):
    return [str(v) for v in values]


@checks("1A")
def _(c):
    c.visible("Each measurement above 11 is printed on its own line", lambda run: expect_lines(run, ["11.8", "12.4", "11.5"]))
    c.hidden("A different list", lambda run: expect_lines(run, ["12", "13"], "With another list, the output"), with_values(measurements=[8, 12, 11, 13]), "Strictly greater than 11: the value 11 itself does not qualify")
    c.hidden("An empty list", lambda run: expect_lines(run, [], "With an empty list, the output"), with_values(measurements=[]), "A loop over an empty list runs zero times")


@checks("1B")
def _(c):
    c.visible("Only the final total is printed", lambda run: expect_lines(run, ["3"]), concept="Print after the loop, not inside it")
    c.hidden("A different list", lambda run: expect_lines(run, ["2"], "With another list, the output"), with_values(measurements=[11, 12, 12, 10]), "The counter starts once, before the loop")
    c.hidden("An empty list", lambda run: expect_lines(run, ["0"], "With an empty list, the output"), with_values(measurements=[]), "The total is still printed when nothing qualifies")


@checks("1C")
def _(c):
    def default(run):
        no_crash(run)
        got = run.call("count_high", [9.5, 10.2, 11.8, 12.4, 10.7, 11.5])
        need(got == 3 and isinstance(got, int), f"`count_high(measurements)` returned {got!r}; expected the integer 3. If it returned None, the function prints or forgets to return.")

    c.visible("count_high returns 3 for the measurements", default, concept="return hands the value back to the caller")
    c.visible("The result is printed by the call outside the function", lambda run: expect_lines(run, ["3"]), concept="One print, outside the function")

    def other(run):
        no_crash(run)
        got = run.call("count_high", [7, 12, 13])
        need(got == 2, f"`count_high([7, 12, 13])` returned {got!r}; expected 2. A return inside the loop stops at the first match.")

    c.hidden("A different list", other, concept="return belongs after the loop has finished")

    def empty(run):
        no_crash(run)
        got = run.call("count_high", [])
        need(got == 0, f"`count_high([])` returned {got!r}; expected 0.")

    c.hidden("An empty list", empty, concept="The counter needs a starting value")

    def quiet(run):
        no_crash(run)
        run.call("count_high", [12, 13])
        need(run.call_output == "", "The function itself should not print; it should return the count.")
        need(len(run.lines()) == 1, f"The program printed {len(run.lines())} line(s); expected only the final result.")

    c.hidden("The function does not print", quiet, concept="print inside a function is not a return value")


@checks("1D")
def _(c):
    def default(run):
        no_crash(run)
        got = run.call("get_low", [9.5, 10.2, 11.8, 9.1, 10.7, 8.5])
        need(got == [9.5, 9.1, 8.5], f"`get_low(measurements)` returned {got!r}; expected the list [9.5, 9.1, 8.5].")
        need(isinstance(got, list), f"`get_low` should return a list, not {type(got).__name__}.")

    c.visible("get_low returns the values below 10 as a list", default)
    c.visible("The returned list is printed", lambda run: expect_lines(run, ["[9.5, 9.1, 8.5]"]))

    def other(run):
        no_crash(run)
        got = run.call("get_low", [12, 8, 9, 10])
        need(got == [8, 9], f"`get_low([12, 8, 9, 10])` returned {got!r}; expected [8, 9]. Strictly below 10.")

    c.hidden("A different list", other, concept="Return once, after the loop")

    def empty(run):
        no_crash(run)
        got = run.call("get_low", [])
        need(got == [], f"`get_low([])` returned {got!r}; expected an empty list.")

    c.hidden("An empty list", empty, concept="Start from an empty list")


@checks("1E")
def _(c):
    def default(run):
        expect_lines(run, ["3", "11.8"])

    c.visible("The count and the first high value are printed", default)

    def once(run):
        no_crash(run)
        need(run.called("get_high") == 1, f"`get_high` was called {run.called('get_high')} time(s); call it once and keep what it returns in a variable.")

    c.visible("get_high is called exactly once", once, concept="A returned value can be stored and reused")

    def other(run):
        expect_lines(run, ["2", "15"], "With another list, the output")
        need(run.called("get_high") == 1, "`get_high` should still be called once.")

    c.hidden("A different list", other, with_values(measurements=[15, 12]), "len(result) and result[0] read the stored list")

    def returns_list(run):
        no_crash(run)
        got = run.call("get_high", [10, 12, 11.5])
        need(got == [12, 11.5], f"`get_high([10, 12, 11.5])` returned {got!r}; expected the list [12, 11.5].")

    c.hidden("get_high returns a list", returns_list, concept="The function returns a list, not a printout")


@checks("1F")
def _(c):
    def default(run):
        no_crash(run)
        got = run.call("first_high", [9.5, 10.2, 11.8, 12.4, 10.7, 11.5])
        need(got == 11.8, f"`first_high(measurements)` returned {got!r}; expected 11.8, the first value above 11 (not the last).")

    c.visible("first_high returns the first value above 11", default)
    c.visible("The result is printed", lambda run: expect_lines(run, ["11.8"]))

    def none(run):
        no_crash(run)
        got = run.call("first_high", [8, 10, 11])
        need(got is None, f"`first_high([8, 10, 11])` returned {got!r}; expected None when nothing is above 11.")

    c.hidden("No value qualifies", none, concept="return None after the loop")

    def empty(run):
        no_crash(run)
        got = run.call("first_high", [])
        need(got is None, f"`first_high([])` returned {got!r}; expected None.")

    c.hidden("An empty list", empty, concept="The loop body never runs for an empty list")

    def first_not_last(run):
        no_crash(run)
        got = run.call("first_high", [5, 20, 30, 12])
        need(got == 20, f"`first_high([5, 20, 30, 12])` returned {got!r}; expected 20. Here an early return is exactly what you want.")

    c.hidden("Several values qualify", first_not_last, concept="return exits the function immediately")
