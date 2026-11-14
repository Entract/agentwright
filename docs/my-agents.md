# My Agents: a code-first agent workbench

Status: design agreed on 2026-11-14 (the user: saving the conversation is the learner's job and a future exercise). Slices 1 and 2 built. The tracer is `desktop/lab_trace.py`, started as a launcher (`python -u lab_trace.py main.py`) rather than through `sitecustomize`, so it cannot clash with one already in the learner's Python.

## What it is

A fourth section of the PC window (later the phone): **My Agents**. An agent is one Python program the learner wrote with the plain Anthropic SDK, saved under a name. It can be used as a chatbot, and its code can be opened and changed at any moment. Nothing is hidden behind a visual editor: the program that runs is the file on screen.

The learning loop: build an agent in Revision or the Scratchpad, save it to My Agents, use it as a real chatbot. The reward for an exercise is working software.

## Principles

1. **The agent is ordinary Python.** No framework, no base class, no required helper. Code that passes here is the code the learner would write anywhere else, including at work. `input()` reads the user's message, `print()` shows the reply, exactly as in the Scratchpad.
2. **The app observes; it does not change the program.** Everything the workbench shows (tool calls, tokens, cost, cache use) comes from watching the SDK calls the program makes, not from asking the learner to add logging.
3. **Simulated tools by default.** Instrument functions are the learner's own Python. Nothing here controls a real device.
4. **Keys stay where they are.** The saved key is passed to the program as `ANTHROPIC_API_KEY`, as in the Scratchpad. It is never written into an agent, an export or a log.

## How the chat view works

- Run starts the agent's program with the PC's Python. What it prints becomes agent bubbles; what the learner types is sent to its `input()` and becomes user bubbles.
- A turn ends when the program asks for input again. That is how the view knows where one reply stops.
- **Edit** flips to the code (the Scratchpad editor) and back. The raw console is one click away for debugging.

## Tool-call inspector, tokens and cost (the tracer)

The host starts the program with a small tracing module on its path (through `PYTHONPATH` and `sitecustomize`). It wraps `messages.create` and `messages.stream` on the Anthropic client and, for every call, writes one JSON line to a side channel the page reads:

- the request: model, number of messages, tool names, and any `tool_result` blocks in the newest user message (content, `is_error`);
- the response: stop reason, text, each `tool_use` block (name, input, id), and `usage` (input, output, cache read, cache write tokens);
- time taken, and the exception if the call failed.

From these the page builds, per reply: which tools Claude asked for, with what arguments, what the Python returned, whether anything failed, how many rounds it took, and what it cost. Clicking a reply opens this. The learner's code is untouched, and an agent written without tools simply shows one call.

Spend is tokens times a price table, shown per reply, per conversation and per agent, labelled as an estimate. Cache read and write tokens are shown as they are, which makes prompt caching visible the first time the learner adds `cache_control`.

## Versions

- Every Run saves the code as it was run. When that run produced a reply without a traceback, the snapshot is marked **working**.
- The version list shows time, whether it worked, and a diff against the current code. Revert copies an old version into the editor (itself a new version; nothing is destroyed).
- Kept: the last 30 versions per agent, plus any the learner pins.

## Changing code mid-conversation

The conversation lives in the program's own `messages` list, so it ends when the process ends. After an edit the learner chooses:

- **Start fresh** (default): new process, empty chat.
- **Keep the conversation**: only offered when the agent keeps its history in a file. The app sets `AGENT_HISTORY` to a per-conversation JSON path; an agent that loads `messages` from it at start and saves after each turn carries on where it left off. This is about six lines of Python and is taught as an exercise, because saving and loading history is something agents really need.

Replaying the learner's earlier messages into the new process is deliberately not offered: it would call Claude again and run every tool again, which is exactly the duplicate-action problem to avoid.

## Sharing

Export writes one `.agent.json`: name, description, code, and optionally pinned versions. Never the key, never conversations unless ticked. Import shows the code and a plain warning before the first run, because an agent is a program that runs on the PC with the learner's key: only run code you have read or trust.

## Deliberately left out of the first version

- **Memory, long-term notes, retrieval.** Better built by the learner as exercises (history file first, then a notes tool) than supplied.
- **A tool marketplace or MCP.** Later, a small importable module of the course's simulated instruments.
- **Web search needs no app feature.** It is one of Anthropic's server tools: the learner adds it to the `tools` list in their own code and Anthropic runs it. Wanted by the user (2026-11-14) as a lesson: "give your agent web search". The tracer in slice 2 should show server tool use too.
- **Evals.** The natural next step after versions: save a conversation as a test, replay it against a new version, and compare tool calls. Ties to the course's eval milestone.

## Slices

1. **Save and chat (PC).** My Agents section: list, new, rename, delete, export, import (with the warning); chat view over the running program; Edit toggle; "Save to My Agents" from the Scratchpad and from a passed Revision question.
2. **Tracer.** Tool-call inspector, tokens and estimated cost per reply and per agent.
3. **Versions and restarts.** Version list, diff, revert; Start fresh or Keep the conversation (history-file convention) after an edit.
4. **Phone.** The same section in the phone app, using the phone's Python.
5. **Later.** Evals from saved conversations; toolbox module; server tools.

## Storage

Slice 1 keeps agents where Revision keeps its sets: the PC window's own storage (and the phone app's settings table later), which survives app updates. Each agent can be exported as a file. If agents need to be opened in other editors, a later slice can move them to files under the Scratchpad's work folder (`agents/<id>/agent.py`).
