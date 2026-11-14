"""Adds the six code-reading exercises 7R-A..7R-F to the manifest, before 7A. Safe to run twice."""
import json
import sys

path = sys.argv[1]
manifest = json.load(open(path, encoding="utf-8"))

FIXTURES = {
    "balance_class": '''class Balance:
    """One balance on the bench."""

    def __init__(self, balance_id, unit="g"):
        self.balance_id = balance_id
        self.unit = unit
        self.readings = 0

    def read(self):
        self.readings += 1
        return {"balance_id": self.balance_id, "mass": 10.52, "unit": self.unit}''',
    "traceback_text": '''trace = """Traceback (most recent call last):
  File "agent.py", line 41, in <module>
    result = run_tool(block.name, block.input)
  File "agent.py", line 17, in run_tool
    return check_temperature(tool_input["sensor"])
KeyError: 'sensor'"""''',
    "fragile_dispatcher": '''def run_tool(name, tool_input):
    if name == "check_temperature":
        return {"sensor_id": tool_input["sensor"], "temperature": 22.4, "unit": "C"}
    raise ValueError("Unknown tool: " + name)''',
    "typed_function": '''def format_reading(mass: float, unit: str = "g", places: int = 2) -> str:
    """Return the reading as text, for example '10.52 g'."""
    return f"{mass:.{places}f} {unit}"''',
    "tool_decorator": '''TOOLS = {}

def tool(fn):
    """Remember the function under its own name, and hand it back unchanged."""
    TOOLS[fn.__name__] = fn
    return fn

@tool
def read_balance():
    return "+ 2.1319 g"''',
}

NOTE = "Added to the pack's 58 exercises on 2026-11-12: recognising Python that appears in real agent code, before the debugging exercises and the timed projects."


def reading(letter, title, mode, fixtures, lesson, task, starter, tests, hints, concepts):
    return {
        "id": f"7R-{letter}", "title": title, "module": "7", "priority": "P0", "mode": mode, "fixtures": fixtures,
        "lesson": lesson, "task": task, "starter": starter, "tests": tests, "hints": hints, "concepts": concepts, "author_notes": NOTE,
    }


EXERCISES = [
    reading(
        "A", "Read imports", "write", [],
        [
            "Real programs are spread over several files. `import` is how one file reaches code in another. There are three forms, and you will see all of them at the top of any agent.",
            "`import instruments` brings in the whole file. You reach things inside it with a dot: `instruments.read_balance(...)`.",
            "`from instruments import read_balance` brings in one name. You then call it directly: `read_balance(...)`.",
            "`import instruments as lab` brings in the whole file under a shorter name: `lab.read_balance(...)`.",
            "When you see a name you do not recognise in someone's code, look at the imports first: they tell you which file or library it came from. `import anthropic` and `from anthropic.types import Message` are the same two forms.",
        ],
        "`instruments.py` (second tab, read only) holds `read_balance`. `main.py` already uses the first form. Add the other two: import only the function and call it by its own name, then import the module under the name `lab` and call `lab.read_balance`. Each call uses `\"XPR205\"` and prints its result, so the program prints the same reading three times.",
        "# Three ways to reach the same function in instruments.py.\n\nimport instruments\nprint(instruments.read_balance(\"XPR205\"))\n\n# 1. Import only the function, then call it by its own name and print the result.\n\n# 2. Import the module under the short name lab, then call lab.read_balance and print the result.\n",
        [
            "the same reading is printed three times",
            "one import uses from instruments import read_balance",
            "one import uses import instruments as lab",
            "the function is not copied into main.py",
        ],
        [
            "Form 2 is one line: `from instruments import read_balance`. After it, `read_balance(\"XPR205\")` works with no prefix.",
            "Form 3 is `import instruments as lab`. After it, `lab` means the same file as `instruments`.",
            "Each of the two needs its own `print(...)` line, as the first form has.",
        ],
        ["import", "from import", "as", "modules"],
    ),
    reading(
        "B", "Read a class and self", "write", ["balance_class"],
        [
            "A class is a blueprint for objects that carry their own data. `Balance(\"XPR205\")` makes one object; Python runs `__init__` to set it up.",
            "`self` is the object itself. Python fills it in for you, so you always pass one argument fewer than the `def` line shows: `__init__(self, balance_id, unit=\"g\")` is called as `Balance(\"XPR205\")`.",
            "`self.balance_id = balance_id` stores a value on the object. Afterwards `balance.balance_id` reads it. Each object has its own copy.",
            "A function inside a class is a method. `balance.read()` runs `read` with `self` set to that object.",
            "You have used this all along: `client.messages.create(...)` is an object (`client`), an attribute of it that is another object (`messages`), and a method (`create`). `response.content` and `block.name` are attributes.",
        ],
        "Using the `Balance` class on the left: make a Balance for `\"XPR205\"` called `balance`. Read it twice and keep the second reading in `result`. Set `count` to the number of readings the object has recorded (ask the object; do not type 2). Make a second Balance called `other` for `\"AB104\"` with the unit `\"mg\"`.",
        "# Balance is defined for you (see the left). Fill in each line.\n\nbalance = None        # make a Balance for \"XPR205\"\n# read it once here, then:\nresult = None         # the second reading\ncount = None          # how many times has this balance been read? Ask the object.\nother = None          # a second Balance, for \"AB104\", with the unit \"mg\"\n\nprint(result)\nprint(count)\nprint(other.unit)\n",
        [
            "balance is a Balance for XPR205 that has been read exactly twice",
            "result is the reading dictionary",
            "count comes from balance.readings",
            "other is a separate object with unit mg that has not been read",
        ],
        [
            "`balance = Balance(\"XPR205\")`. You do not pass `self`.",
            "`balance.read()` on a line of its own is the first reading; `result = balance.read()` is the second. `count = balance.readings` has no brackets: it is data, not a method.",
            "`other = Balance(\"AB104\", unit=\"mg\")`. Its `readings` stays 0 because it is a different object.",
        ],
        ["class", "self", "__init__", "attributes", "methods"],
    ),
    reading(
        "C", "Read a traceback and catch an exception", "trace", ["traceback_text", "fragile_dispatcher"],
        [
            "When Python cannot carry on, it raises an exception and prints a traceback. Read a traceback from the bottom up.",
            "The last line is the kind of error and its message: `KeyError: 'sensor'` means a dictionary was asked for the key `sensor` and did not have it.",
            "The pair of lines just above it is where it happened: the file, the line number, the function, and the line of code itself. Higher pairs show who called that function.",
            "`try:` and `except KeyError as exc:` let a program carry on. The code under `try` is attempted; if that kind of error is raised, the code under `except` runs instead, and `exc` holds the error. `raise ValueError(\"...\")` is how code reports a problem of its own.",
        ],
        "Part 1: read the traceback in `trace` and fill in the four answers. Part 2: `run_tool` on the left has the bug the traceback shows. Call `run_tool(\"check_temperature\", {\"sensor_id\": \"TEMP02\"})` inside `try`, storing what it returns in `outcome`; if it raises `KeyError`, set `outcome` to `\"missing key: \"` followed by `str(exc)` instead.",
        "# Part 1: read the traceback on the left (the variable trace) and answer.\nerror_type = None      # the name of the exception, as a string\nfailed_in = None       # the name of the function where it happened, as a string\nfailed_line = None     # the line number where it happened, as a number\nmissing_key = None     # the key that was not there, as a string\n\n# Part 2: call run_tool(\"check_temperature\", {\"sensor_id\": \"TEMP02\"}) without crashing.\noutcome = None\n\nprint(error_type, failed_in, failed_line, missing_key)\nprint(outcome)\n",
        [
            "the four answers match the traceback: KeyError, run_tool, 17, sensor",
            "outcome is \"missing key: 'sensor'\" and the program does not crash",
            "when run_tool works, outcome is what it returned",
            "only the dictionary error is turned into text",
        ],
        [
            "Bottom line first: the exception's name is before the colon, and its message (the missing key) after it.",
            "The line number and function are in the last `File \"agent.py\", line ..., in ...` line, not the first.",
            "`try:` then `outcome = run_tool(...)` indented; `except KeyError as exc:` then `outcome = \"missing key: \" + str(exc)` indented.",
        ],
        ["traceback", "KeyError", "try/except", "raise"],
    ),
    reading(
        "D", "Read type hints, docstrings and f-strings", "trace", ["typed_function"],
        [
            "`def format_reading(mass: float, unit: str = \"g\", places: int = 2) -> str:` looks dense. Take away the hints and it is `def format_reading(mass, unit=\"g\", places=2):`.",
            "`: float`, `: str` and `-> str` are type hints: notes saying what kind of value is expected and what comes back. Python does not check them when the program runs. Editors and some libraries read them; the SDK's `@beta_tool` builds a tool's `input_schema` from them.",
            "`= \"g\"` is a default: the argument may be left out. Arguments can also be given by name, `places=0`, in any order.",
            "The string in triple quotes straight after the `def` line is a docstring: the function's description for readers and tools.",
            "An f-string, `f\"...\"`, puts values into text: `f\"{name}: {value}\"`. After a colon comes a format: `{mass:.2f}` means two decimal places.",
        ],
        "Part 1: for the function on the left, work out what each of the three calls returns and write it as a string; run to check yourself. Part 2: set `python_checks_hints` to `True` or `False`: does Python refuse `format_reading(\"heavy\")` because of the hint `mass: float`, before running the function's code? Part 3: write `describe(sensor_id, temperature)` with an f-string, so that `describe(\"TEMP02\", 22.4)` returns `TEMP02: 22.4 C`.",
        "# format_reading is defined for you (see the left). Read its first line and its docstring.\n\n# Part 1: write each answer as a string.\nanswer_a = None      # what does format_reading(10.5) return?\nanswer_b = None      # what does format_reading(2.13456, \"mg\", 3) return?\nanswer_c = None      # what does format_reading(7, places=0) return?\n\n# Part 2: True or False.\npython_checks_hints = None\n\n# Part 3: an f-string of your own.\ndef describe(sensor_id, temperature):\n    pass\n\nprint(answer_a, answer_b, answer_c)\nprint(python_checks_hints)\nprint(describe(\"TEMP02\", 22.4))\n",
        [
            "the three answers are what the calls really return",
            "python_checks_hints is False",
            "describe returns '<sensor_id>: <temperature> C' for any values",
        ],
        [
            "With no other arguments, `unit` is \"g\" and `places` is 2, so 10.5 becomes `10.50 g`.",
            "Rounding to 3 places turns 2.13456 into 2.135. With `places=0` there is no decimal point at all.",
            "`return f\"{sensor_id}: {temperature} C\"`. Hints are not enforced, so Part 2 is False: the call fails later, inside the function, for a different reason.",
        ],
        ["type hints", "default arguments", "docstring", "f-string"],
    ),
    reading(
        "E", "Read a decorator", "write", ["tool_decorator"],
        [
            "A line starting with `@` above a `def` is a decorator. `@tool` above `def read_balance():` means: define the function, then pass it to `tool`, and keep whatever `tool` hands back under the same name. It is exactly `read_balance = tool(read_balance)`.",
            "That happens once, when the `def` is reached, not each time the function is called.",
            "Decorators are how libraries let you register things. The `tool` on the left adds each function to the dictionary `TOOLS` under its own name. The SDK's `@beta_tool` does something similar: it reads the function and builds the tool definition from it.",
            "A dictionary can hold functions. `TOOLS[\"read_balance\"]` is the function itself; adding `()` calls it.",
        ],
        "Add a second tool the same way: a function `check_temperature(sensor_id)` decorated with `@tool`, returning `{\"sensor_id\": sensor_id, \"temperature\": 22.4, \"unit\": \"C\"}`. Then set `names` to a sorted list of the names in `TOOLS`, and set `reading` by calling the `read_balance` function found in `TOOLS`.",
        "# TOOLS and the decorator tool are defined for you, with one decorated function (see the left).\n\n# 1. Add check_temperature(sensor_id) as a second tool, decorated the same way.\n\n# 2. Fill these in using TOOLS, not the function names.\nnames = None       # a sorted list of the names in TOOLS\nreading = None     # call the read_balance function found in TOOLS\n\nprint(names)\nprint(reading)\n",
        [
            "check_temperature is defined with @tool above it and returns the reading dictionary",
            "TOOLS holds both functions",
            "names is ['check_temperature', 'read_balance']",
            "reading comes from calling TOOLS['read_balance']",
        ],
        [
            "Write `@tool` on its own line, directly above `def check_temperature(sensor_id):`.",
            "`names = sorted(TOOLS)` gives the keys in alphabetical order.",
            "`reading = TOOLS[\"read_balance\"]()`: look the function up, then call it with `()`.",
        ],
        ["decorator", "functions as values", "registry"],
    ),
    reading(
        "F", "Read one-line loops", "write", ["sdk_message"],
        [
            "Experienced Python writers often fold a loop into one line. `[block.name for block in response.content if block.type == \"tool_use\"]` is a list comprehension. Read it from the middle: for each block in the content, if it is a tool_use, take its name; the square brackets collect the results into a list.",
            "It is the same as starting with an empty list, looping, testing with `if`, and appending. Nothing more.",
            "With curly brackets and a colon it builds a dictionary instead: `{block.name: block.input for block in ...}`.",
            "`for key, value in some_dict.items():` goes through a dictionary giving you each key together with its value.",
            "`\"\\n\".join(list_of_strings)` glues strings into one, with a new line between them. It is how most agents turn several text blocks into one answer.",
        ],
        "The first two lines of the starter are written in the one-line style. Build `names_loop` with an ordinary `for` loop so that it equals `names`. Go through `inputs` with `.items()` and fill `needs` with one string per tool in the form `read_balance: {'balance_id': 'XPR205'}`. Set `answer` to the text of all the text blocks joined with `\"\\n\"`.",
        "# These two lines are common in agent code. Each does a whole loop in one line.\nnames = [block.name for block in response.content if block.type == \"tool_use\"]\ninputs = {block.name: block.input for block in response.content if block.type == \"tool_use\"}\n\n# 1. Build the same list as names with an ordinary for loop.\nnames_loop = []\n\n# 2. Go through inputs with .items(): one string per tool, like  read_balance: {'balance_id': 'XPR205'}\nneeds = []\n\n# 3. The text of every text block, joined with \"\\n\".\nanswer = None\n\nprint(names_loop)\nprint(needs)\nprint(answer)\n",
        [
            "names_loop equals names, for any response",
            "needs has one '<name>: <input>' string per requested tool",
            "answer is the text blocks joined with a new line",
            "nothing is typed in: a different response gives different results",
        ],
        [
            "`for block in response.content:` then `if block.type == \"tool_use\":` then `names_loop.append(block.name)`.",
            "`for name, tool_input in inputs.items():` then `needs.append(f\"{name}: {tool_input}\")`.",
            "`answer = \"\\n\".join(block.text for block in response.content if block.type == \"text\")`, or build a list of the texts in a loop and join that.",
        ],
        ["list comprehension", "dict comprehension", ".items()", "join"],
    ),
]

manifest["fixtures"].update(FIXTURES)
new_ids = {e["id"] for e in EXERCISES}
kept = [e for e in manifest["exercises"] if e["id"] not in new_ids]
at = next(i for i, e in enumerate(kept) if e["id"] == "7A")
manifest["exercises"] = kept[:at] + EXERCISES + kept[at:]
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(len(manifest["exercises"]), "exercises")
