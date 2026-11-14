"""Adds the LAB-AGENT module and its milestones to the manifest. Safe to run again; it replaces its own entries."""
import json
import sys

path = sys.argv[1]
manifest = json.load(open(path, encoding="utf-8"))

MODULE = {
    "id": "LAB",
    "name": "LAB-AGENT: build your own agent",
    "weight": "Project",
    "goal": "Write one small agent yourself, a piece at a time. Each milestone starts from your own code from the one before.",
}
NOTE = "LAB-AGENT project, added 2026-11-12. Milestone IDs are permanent. The learner's own passing code carries into the next milestone."

STARTER_01 = '''# LAB-AGENT: my own agent. It grows one milestone at a time.

def reply(question):
    # LAB-01: return the text the agent answers with
    pass


while True:
    question = input("You: ")
    # LAB-01: if the question is "quit", print Goodbye and leave the loop.
    #         Otherwise print "Agent:" followed by reply(question).
'''


def milestone(number, title, after, todo, lesson, task, tests, hints, concepts, starter=""):
    return {
        "id": f"LAB-{number:02d}",
        "title": title,
        "module": "LAB",
        "priority": "P0",
        "mode": "build",
        "fixtures": [],
        "after": after,
        "todo": todo,
        "lesson": lesson,
        "task": task,
        "starter": starter,
        "tests": tests,
        "hints": hints,
        "concepts": concepts,
        "author_notes": NOTE,
    }


EXERCISES = [
    milestone(
        1, "A chat shell with no Claude in it", "1F",
        "write reply() and finish the loop",
        [
            "Every chat agent has the same outer shape: read a line from the person, work out an answer, print it, and go round again until told to stop. This milestone builds that shape with nothing clever inside it.",
            "`input(\"You: \")` waits for a line to be typed and gives it back as a string. `while True:` repeats forever, so the loop needs a way out: `break`.",
            "Press Run to talk to your program in the Output panel. Type `quit` to end it.",
        ],
        "Finish `reply(question)` so it returns the text `You said: ` followed by the question. In the loop, when the question is `quit`, print `Goodbye` and leave the loop; for anything else print `Agent:` followed by the reply.",
        [
            "typing hello prints: Agent: You said: hello",
            "typing quit prints Goodbye and the program ends without asking again",
            "reply returns the text; it does not print it",
            "several questions in a row each get their own answer",
        ],
        [
            "`reply` needs one line: `return \"You said: \" + question`.",
            "Inside the loop: `if question == \"quit\":` then `print(\"Goodbye\")` and `break`, both indented under the `if`.",
            "After the `if` block, at the loop's indentation: `print(\"Agent:\", reply(question))`.",
        ],
        ["input", "while True", "break", "return"],
        STARTER_01,
    ),
    milestone(
        2, "A simulated balance", "1F",
        "add read_balance() and make the word weigh use it",
        [
            "A tool is an ordinary Python function that does something outside the conversation. Your first one pretends to be a lab balance.",
            "For now you decide when it runs: when the person types exactly `weigh`. Notice how rigid that is. \"Please weigh the sample\" will not work. Letting Claude decide when a tool is needed is what turns this into an agent, and it starts at LAB-04.",
        ],
        "Add a function `read_balance()` that takes no arguments and returns the string `+ 2.1319 g`. Change `reply` so that for the question `weigh` it returns a sentence containing the reading from `read_balance()`. Every other question is answered as before.",
        [
            "read_balance() returns '+ 2.1319 g' and prints nothing",
            "typing weigh gives an Agent line containing + 2.1319 g",
            "the balance is read once per weigh, and not at all for other questions",
            "hello and quit still behave as in LAB-01",
        ],
        [
            "Define it above `reply`: `def read_balance():` with one line, `return \"+ 2.1319 g\"`.",
            "In `reply`, test the question first: `if question == \"weigh\":`.",
            "Inside that `if`: `return \"The balance reads \" + read_balance()`. Call the function; do not type the reading again.",
        ],
        ["functions", "return", "calling a tool yourself"],
    ),
    milestone(
        3, "Describe the balance to Claude", "3P-C",
        "add the tools list with one definition for read_balance",
        [
            "Claude cannot see your Python. The only way it learns that a balance exists is a tool definition: a dictionary with `name`, `description` and `input_schema`, in a list called `tools` that you will send with every request.",
            "The description is what Claude reads to decide when to use the tool, so say what it does and what it gives back. `read_balance` takes no arguments, so its `properties` are empty.",
            "Nothing uses `tools` yet. The program should behave exactly as it did after LAB-02.",
        ],
        "Above the loop, create `tools`: a list with one definition for `read_balance`. Its description must be at least eight words and say what the tool returns. It takes no arguments.",
        [
            "tools is a list with one definition named read_balance",
            "the description is a real sentence of at least eight words",
            "input_schema is type object with empty properties",
            "the program still behaves as in LAB-02",
        ],
        [
            "You wrote this shape in 3P-B: `tools = [{\"name\": ..., \"description\": ..., \"input_schema\": ...}]`.",
            "The schema for no arguments is `{\"type\": \"object\", \"properties\": {}}`.",
            "A good description: what it reads, and the form of what comes back, for example '+ 2.1319 g'.",
        ],
        ["tool definition", "description", "input_schema"],
    ),
    milestone(
        4, "Ask Claude, and show what it asks for", "3P-F",
        "create the client, send each question to Claude, print its text and its tool requests",
        [
            "Now Claude decides. Instead of testing for the word `weigh`, send every question to Claude together with `tools`, and look at what comes back.",
            "`fake_claude.py` (the second file tab) is a simulated Claude. You call it exactly like the real client: `client.messages.create(model=..., max_tokens=..., messages=..., tools=...)`. It returns a real SDK `Message`.",
            "`messages` is a list of dictionaries. One question is `[{\"role\": \"user\", \"content\": question}]`.",
            "`response.content` is a list of blocks. A `text` block has `.text`. A `tool_use` block has `.name` and `.input`. At this milestone you only print what Claude asks for. Nothing runs the balance yet.",
        ],
        "At the top, `import fake_claude` and create `client = fake_claude.FakeClient()`. In the loop, replace the call to `reply` with a request to Claude that sends the question and `tools` (use `max_tokens=1024` and any model name). For each text block print `Agent:` and its text. For each tool_use block print `Claude asks to run`, the tool's name, `with`, and its input. You may delete `reply`. Then answer the checkpoint question in the explanation box: who decided the balance should be read, and what does your program do about it so far?",
        [
            "each question makes one request, carrying the question and your tools",
            "Claude's text is printed after Agent:",
            "a weighing question prints: Claude asks to run read_balance with {}",
            "read_balance is not called by your program at this stage",
            "quit ends the program without a request",
        ],
        [
            "`response = client.messages.create(model=\"claude-opus-5-5\", max_tokens=1024, messages=[{\"role\": \"user\", \"content\": question}], tools=tools)`",
            "Loop over the blocks: `for block in response.content:` and test `block.type`.",
            "`print(\"Claude asks to run\", block.name, \"with\", block.input)` for a tool_use block. Make sure the `quit` test still comes before the request.",
        ],
        ["client.messages.create", "Message", "content blocks", "tool_use"],
    ),
    milestone(
        5, "Run the tool Claude asked for", "3E",
        "add run_tool(name, tool_input) and call it for each tool_use block",
        [
            "Claude asked; your code acts. A dispatcher is the function that turns a tool name into a call to the right Python function.",
            "Keeping it in its own function, `run_tool(name, tool_input)`, means there is one place that knows which tools exist. A name it does not know must never run anything.",
        ],
        "Add `run_tool(name, tool_input)`. For `read_balance` it returns what `read_balance()` returns. For any other name it returns the text `Unknown tool: ` followed by the name. In the loop, for each tool_use block, call `run_tool` with the block's name and input and print `Tool result:` followed by what came back.",
        [
            "run_tool('read_balance', {}) returns the reading",
            "an unknown name returns 'Unknown tool: <name>' and runs nothing",
            "a weighing question reads the balance once and prints the result",
            "other questions do not touch the balance",
            "no eval, globals or getattr: only names you list can run",
        ],
        [
            "`def run_tool(name, tool_input):` then `if name == \"read_balance\": return read_balance()`.",
            "The last line of `run_tool`: `return \"Unknown tool: \" + name`.",
            "In the loop, under the tool_use test: `result = run_tool(block.name, block.input)` then `print(\"Tool result:\", result)`.",
        ],
        ["dispatch", "allowlist", "block.name", "block.input"],
    ),
    milestone(
        6, "Package the result for Claude", "4B",
        "add make_tool_result(block, result) and collect one per request in results",
        [
            "Claude cannot see what you printed. To tell it what the balance said, you build a `tool_result` block: a dictionary with `\"type\": \"tool_result\"`, the `tool_use_id` of the request it answers, and the result as `content`.",
            "The id matters because Claude can ask for several tools at once. Each result must carry the id of its own request.",
            "This milestone only builds the results. Sending them is LAB-07.",
        ],
        "Add `make_tool_result(block, result)` returning the tool_result dictionary for that request. In the loop, start an empty list `results` before going through the blocks, and for each tool_use block append `make_tool_result(block, result)` to it.",
        [
            "make_tool_result returns type tool_result, the block's own id, and the result as content",
            "one tool_result is made for each tool request",
            "none is made when Claude asks for no tool",
        ],
        [
            "The dictionary has three keys: `\"type\"`, `\"tool_use_id\"` and `\"content\"`.",
            "`\"tool_use_id\": block.id` and `\"content\": result`.",
            "`results = []` goes inside the `while` loop, before `for block in response.content:`, so each question starts with an empty list.",
        ],
        ["tool_result", "tool_use_id", "collecting results"],
    ),
    milestone(
        7, "Keep the conversation and send the results back", "4H",
        "keep a messages list, add each turn to it, and send tool results back once",
        [
            "Claude remembers nothing between requests. Everything it knows is in the `messages` list you send, so your program has to keep that list and add to it.",
            "The order is fixed. The person's question goes in as a `user` message. Claude's whole reply goes in as an `assistant` message with `response.content` as its content. If that reply asked for tools, your results go in as the next `user` message, and you ask Claude again.",
            "If the order is wrong, the simulated Claude refuses the request with the same kind of error the real API gives. Read the error: it names the message that is wrong.",
        ],
        "Create `messages = []` above the loop. For each question append it as a user message and send the whole list. Append Claude's reply as an assistant message. If the reply's `stop_reason` is `tool_use`, append your `results` as one user message, send the list again, append that reply too, and print its text after `Agent:`.",
        [
            "a weighing question makes two requests; the second carries question, Claude's request, and your result",
            "the tool_result has the id of Claude's request and the balance reading",
            "Claude's final answer, quoting the reading, is printed",
            "a later question is sent with the whole conversation so far",
            "a question that needs no tool makes one request",
        ],
        [
            "`messages.append({\"role\": \"user\", \"content\": question})`, then pass `messages=messages` to `create`.",
            "Straight after each request: `messages.append({\"role\": \"assistant\", \"content\": response.content})`.",
            "After the block loop: `if response.stop_reason == \"tool_use\":` append `{\"role\": \"user\", \"content\": results}`, call `create` again into `response`, append it as assistant, and print its text blocks.",
        ],
        ["conversation history", "roles", "stop_reason", "second request"],
    ),
    milestone(
        8, "The complete loop", "5D",
        "turn the single follow-up into a loop that continues while Claude keeps asking for tools",
        [
            "After seeing a result, Claude may ask for another tool instead of answering. Try your LAB-07 program with \"weigh it twice\": the second reply is another request, and an `if` that handles one round leaves it unanswered.",
            "The fix is the heart of every agent: `while response.stop_reason == \"tool_use\":` run the tools, send the results, read the next reply. When the loop ends, the last reply is the final answer.",
            "This is the whole architecture. Everything after this milestone is refinement.",
        ],
        "Change your program so that it keeps running tools and sending results for as long as Claude's reply has the stop reason `tool_use`, and prints the final answer when it does not. Then, in the explanation box, trace \"weigh it twice\": list each request your program makes and what stop reason comes back.",
        [
            "weigh it twice: three requests, the balance is read twice, the final answer quotes both readings",
            "an ordinary weighing question still makes two requests",
            "a question that needs no tool makes one request",
            "the history stays valid across several questions",
        ],
        [
            "Most of your LAB-07 code is already the body of the loop. The change is `if` to `while`, and making sure the tool-running part is inside it.",
            "Each pass of the loop: empty `results`, run every tool_use block in `response.content`, append the results as a user message, request again into the same variable `response`, append that reply as assistant.",
            "Print the final text after the `while` loop ends, from the last `response`.",
        ],
        ["agent loop", "while", "stop_reason", "multiple rounds"],
    ),
    milestone(
        9, "A second tool, and tools that fail", "6C",
        "add check_temperature with an argument, and turn every tool failure into an error result",
        [
            "Real instruments fail, and Claude sometimes asks for something you cannot do. An agent that crashes on the first failure is no use in a lab. Instead, the failure is sent back to Claude as a tool_result with `\"is_error\": True` and text saying what went wrong. Claude then tells the person.",
            "This milestone adds a second tool that takes an argument, so the dispatcher now reads `tool_input`. The argument can be missing or wrong: Claude wrote it, not you.",
            "A tool_result's content must be text. A function that returns a dictionary needs `json.dumps` before its result is sent.",
            "The pattern is `try:` run the tool, `except Exception as exc:` build the error text. Every tool request must still get a result, whether it worked or not.",
        ],
        "Add `check_temperature(sensor_id)`: it returns `{\"sensor_id\": sensor_id, \"temperature\": 22.4, \"unit\": \"C\"}`, except for the disconnected sensor `TEMP00`, where it raises `RuntimeError` with a message that names the sensor. Add its definition to `tools` (one required string argument, `sensor_id`). Make `run_tool` handle it, returning the reading as JSON text. Then make every failure (an unknown tool name, a missing `sensor_id`, an instrument error) produce a tool_result with `\"is_error\": True` and content that says what failed, including the tool name or the argument or the sensor concerned. The program must carry on after a failure.",
        [
            "check_temperature returns the reading dictionary and raises RuntimeError for TEMP00",
            "tools defines read_balance and check_temperature (sensor_id: string, required)",
            "a temperature question sends the reading back as JSON text",
            "an unknown tool, a missing argument and an instrument error each become an is_error result that names what failed",
            "two tools asked for in one reply get two results in one message",
            "after a failure the next question works normally",
        ],
        [
            "In `run_tool`: `if name == \"check_temperature\": return json.dumps(check_temperature(tool_input[\"sensor_id\"]))`. Put `import json` at the top.",
            "Make the last line of `run_tool` raise instead of return: `raise ValueError(\"Unknown tool: \" + name)`. Now all three kinds of failure are exceptions.",
            "In the loop: `try:` `result = run_tool(block.name, block.input)` and `is_error = False`; `except Exception as exc:` `result = \"Tool failed: \" + type(exc).__name__ + \": \" + str(exc)` and `is_error = True`. Add `\"is_error\": is_error` to the tool_result.",
        ],
        ["second tool", "tool_input", "try/except", "is_error", "json.dumps"],
    ),
    milestone(
        10, "Connect to the real Claude (optional run)", "5G",
        "add the LIVE switch and call_claude(messages); the default stays simulated",
        [
            "Your program already makes the same call the real SDK makes. Going live means creating a different client: `anthropic.Anthropic()` instead of `fake_claude.FakeClient()`. Nothing else changes.",
            "The switch is an environment variable, `LAB_AGENT_LIVE`, so the code is identical in both modes and can never go live by accident. `os.environ.get(\"LAB_AGENT_LIVE\") == \"1\"` is True only when something outside the program set it.",
            "The key is never written in the program. `anthropic.Anthropic()` reads `ANTHROPIC_API_KEY` from the environment by itself.",
            "Putting the request in one function, `call_claude(messages)`, gives you a single place for the model name, `max_tokens` and the tools.",
            "Run and Check tests are always simulated. Only the separate Run live button sets the variable. It asks first, uses the key saved in this app, and sends your conversation to Anthropic, which costs a small amount.",
        ],
        "Add `import os` and `LIVE = os.environ.get(\"LAB_AGENT_LIVE\") == \"1\"`. When `LIVE` is true, `import anthropic` and create `client = anthropic.Anthropic()`; otherwise create the simulated client. Print one line first that contains the word `LIVE` or the word `simulated`, so you always know which it is. Add `call_claude(messages)` that makes the request and returns the response, and use it for every request.",
        [
            "without the variable: simulated client, and the first line printed says simulated",
            "with LAB_AGENT_LIVE=1: anthropic.Anthropic() is created once, and the first line says LIVE",
            "any other value of the variable stays simulated",
            "every request goes through call_claude",
            "no key appears in the program",
            "everything from LAB-09 still works",
        ],
        [
            "`if LIVE:` then `import anthropic` and `client = anthropic.Anthropic()` and a print; `else:` the fake client and a different print.",
            "`def call_claude(messages): return client.messages.create(model=..., max_tokens=1024, messages=messages, tools=tools)`.",
            "Replace both `client.messages.create(...)` calls in the loop with `call_claude(messages)`. Do not pass `api_key`.",
        ],
        ["real client", "environment variable", "call boundary", "keys"],
    ),
    milestone(
        11, "Steer the agent with words", "6H",
        "write rules, send them as the system prompt, and improve both tool descriptions",
        [
            "Two pieces of plain English shape what Claude does: the system prompt and the tool descriptions. Changing them is often the fix for an agent that behaves badly, and it needs no new Python.",
            "The system prompt is a parameter of the request, `system=...`, beside `messages` and `tools`. It is not a message, and like everything else it must be sent with every request.",
            "Write it for a reader who knows nothing but what you say: what the assistant is for, what it must never do, and what to do when something fails. For a lab, the most important rule is that a reading comes from a tool or is not stated at all.",
            "A tool description should say what the tool does, what comes back, and what a failure looks like. Your real balance description already does this.",
            "The simulated Claude only proves that the rules arrive (ask it \"who are you?\"). To see rules change behaviour, use Run live and try the same questions with and without a rule.",
        ],
        "Create `rules`, a string of at least 25 words that says what the assistant is for (the lab and its balance), that it must never guess or invent a reading, and what to do when a tool fails. Pass it as `system=rules` in `call_claude`. Rewrite both tool descriptions to at least 15 words each, saying what comes back.",
        [
            "every request carries system equal to your rules",
            "asking who are you? gets the start of your rules quoted back",
            "the rules mention the lab or balance, not inventing readings, and failures",
            "both tool descriptions are at least 15 words",
            "everything from LAB-10 still works",
        ],
        [
            "A triple-quoted string keeps several lines readable: `rules = \"\"\"You are ... \"\"\"`.",
            "In `call_claude`, add `system=rules` to the `create` call. Do not put the rules into `messages`: a message's role can only be user or assistant.",
            "Three sentences are enough: what you are for; only report readings a tool returned, never guess; if a tool fails, say what the error was and do not retry unless asked.",
        ],
        ["system prompt", "tool descriptions", "steering behaviour"],
    ),
    milestone(
        12, "Reorganise it, and read two other versions", "7E",
        "move one question's work into ask(question, messages) so the chat loop is five lines",
        [
            "Your agent works. Now give each job its own function, so that someone reading it (a colleague, or you in a month) can find things: `call_claude` talks to Claude, `run_tool` picks the tool, and a new `ask(question, messages)` handles one whole question.",
            "This is refactoring: changing the arrangement without changing what the program does. Every earlier test must still pass.",
            "Then read the two other tabs. `other_inline.py` is the same agent as one long loop with different names. `other_tool_runner.py` uses the SDK's tool runner, which does the loop for you. At work you are more likely to be handed code like these than a blank page. The skill is recognising the same parts in a different arrangement.",
        ],
        "Write `ask(question, messages)`: it appends the question to the list it is given, runs the whole tool loop, and returns the final answer as text (it may print Claude's interim text and tool activity, but not the final answer). The chat loop then only reads a line, handles `quit`, and prints `Agent:` followed by what `ask` returns. Then, in the explanation box: in `other_tool_runner.py`, where did your `while` loop and your `tools` list go? In `other_inline.py`, what does the job of your `run_tool`?",
        [
            "ask adds the whole exchange to the list it is given and returns the final answer text",
            "the chat loop calls ask once per question and prints the answer after Agent:",
            "every request still goes through call_claude, every tool through run_tool",
            "everything from LAB-11 still works",
            "the explanation locates the loop, the definitions and the dispatch in the other versions",
        ],
        [
            "Cut everything in the chat loop from `messages.append({\"role\": \"user\", ...})` down to the final print, and paste it into `def ask(question, messages):`, one indentation level less.",
            "Replace the final printing loop with a return: `return \"\\n\".join(block.text for block in response.content if block.type == \"text\")`.",
            "The chat loop's last line becomes `print(\"Agent:\", ask(question, messages))`.",
        ],
        ["refactoring", "functions", "reading unfamiliar code", "tool runner"],
    ),
]

manifest["modules"] = [m for m in manifest["modules"] if m["id"] != "LAB"] + [MODULE]
ids = {e["id"] for e in EXERCISES}
manifest["exercises"] = [e for e in manifest["exercises"] if e["id"] not in ids and not e["id"].startswith("LAB-")] + EXERCISES
with open(path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(len(manifest["exercises"]), "exercises,", len(manifest["modules"]), "modules")
