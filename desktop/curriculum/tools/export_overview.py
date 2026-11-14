"""Writes a review copy of the course as it is built: a Markdown overview and the JSON manifest.

    python tools/export_overview.py <output folder>

Everything comes from manifest.json and from what the checker reports (labcheck.py info), so the
overview always matches what the app shows. No reference solutions are included.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
CURRICULUM = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(CURRICULUM))


def load():
    with open(os.path.join(CURRICULUM, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    done = subprocess.run([sys.executable, os.path.join(CURRICULUM, "labcheck.py"), "info"], capture_output=True, text=True, encoding="utf-8", check=True)
    info = json.loads(done.stdout)
    with open(os.path.join(REPO, "app", "src", "course", "manifest.ts"), encoding="utf-8") as fh:
        source = fh.read()
    route = re.search(r"PRIORITY_ROUTE: string\[\] = \[(.*?)\]", source, re.S).group(1)
    core = set(re.findall(r"'([^']+)'", route))
    with open(os.path.join(REPO, "app", "src", "course", "why.ts"), encoding="utf-8") as fh:
        why = dict(re.findall(r"^\s*'([^']+)': '((?:[^'\\]|\\.)*)',?$", fh.read(), re.M))
    return manifest, info, core, {k: v.replace("\\'", "'") for k, v in why.items()}


def suggested_order(exercises):
    """Numbered exercises in order, with each project milestone placed after the exercise it follows."""
    numbered = [e for e in exercises if e["module"] != "LAB"]
    milestones = [e for e in exercises if e["module"] == "LAB"]
    order = []
    for e in numbered:
        order.append(e)
        order.extend(m for m in milestones if m.get("after") == e["id"])
    return order


def fence(text, language="python"):
    return f"```{language}\n{text.rstrip()}\n```"


def exercise_section(e, info, core, why):
    ws = info["workspaces"].get(e["id"], {})
    lines = [f"### {e['id']} — {e['title']}", ""]
    facts = [f"mode: {e['mode']}", "core route" if e["id"] in core else "extra"]
    if e.get("after"):
        facts.append(f"suggested after {e['after']}")
    if ws.get("previous"):
        facts.append(f"opens with the learner's own passing {ws['previous']} code")
    if ws.get("explanation"):
        facts.append("has a written explanation box")
    if ws.get("live"):
        facts.append("offers the confirmed Run live button")
    lines += ["*" + "; ".join(facts) + "*", ""]
    if e.get("lesson"):
        lines += ["**The idea (shown above the task):**", "", "\n>\n".join(f"> {p}" for p in e["lesson"]), ""]
    lines += [f"**Task:** {e['task']}", ""]
    if ws.get("note"):
        lines += [f"**In this app (shown under the task):** {ws['note']}", ""]
    if e["fixtures"]:
        lines += ["**Already defined for the learner:** " + ", ".join(f"`{f}`" for f in e["fixtures"]), ""]
    extra = sorted(ws.get("extra_fixtures", {}))
    if extra:
        lines += ["**Also supplied by the app:** " + ", ".join(f"`{f}`" for f in extra), ""]
    files = sorted(ws.get("files", {}))
    if files:
        readonly = set(ws.get("readonly", []))
        lines += ["**Files in the workspace:** " + ", ".join(f"`{f}`" + (" (read only)" if f in readonly else "") for f in files) + (f"; Run executes `{ws['entry']}`" if ws.get("entry") else ""), ""]
    starter = ws.get("files", {}).get(ws.get("entry", "main.py")) if ws.get("files") and e["module"] != "LAB" else None
    starter = starter if starter is not None else e.get("starter", "")
    if starter.strip() and len(starter.splitlines()) <= 45:
        lines += ["**Starter code:**", "", fence(starter), ""]
    elif starter.strip():
        lines += [f"**Starter code:** {len(starter.splitlines())} lines (a small project; see the app).", ""]
    lines += ["**What the tests look for:**", ""] + [f"- {t}" for t in e["tests"]] + [""]
    lines += ["**Hints (revealed one at a time, only on request):**", ""] + [f"{i}. {h}" for i, h in enumerate(e["hints"], 1)] + [""]
    if why.get(e["id"]):
        lines += [f"**Why this matters for agents (collapsed panel):** {why[e['id']]}", ""]
    return "\n".join(lines)


INTRO = '''# Python & Claude Agent Learning Lab — the course as built

Exported {today} from the PC Python Scratchpad's Guided course, for review. This file is generated from the same manifest the app reads (`Course_Exercises.json`, beside it), so it matches what the learner sees. Reference solutions are not included.

## Contents of the course

| Part | IDs | Count | What it is |
|---|---|---|---|
| Original pack | 1A to 9C | 58 | The numbered exercises from the Learning Pack, unchanged and never renumbered |
| Preparation for module 3 | 3P-A to 3P-F | 6 | Added 12 Nov: who defines what in tool use, taught before 3A |
| Reading unfamiliar Python | 7R-A to 7R-F | 6 | Added 12 Nov: imports, classes and self, tracebacks and exceptions, type hints and f-strings, decorators, one-line loops; placed before 7A and the timed projects |
| LAB-AGENT project | LAB-01 to LAB-12 | 12 | Added 12 Nov: the learner writes one agent that grows milestone by milestone |

All {total} have executable tests. Python {python}, anthropic SDK {sdk}.

## How an exercise works in the app

- The task stays visible on the left while the learner types on the right. Some exercises open with a short section called "The idea".
- **Run** shows raw output. **Check tests** runs one or two visible tests plus hidden edge cases, each from a fresh start, and reports what it observed when one fails.
- **Hints** are revealed one at a time. A **reference solution** is shown only if asked for, and the exercise then counts as "passed with help" until reset and solved again.
- Status per exercise: not started, in progress, marked done by mentor, passed with help, passed on your own, secure (solved again unaided at least 20 hours later).
- The learner can type an ID ("4A", "3p-b", "lab 5") to jump, and "Copy exercise context" copies the ID, task, their code and the test results for pasting to a mentor.
- Exercises are simulated and offline: responses are real SDK `Message` objects built locally, no key is passed, and network connections are blocked while exercise code runs.

## How LAB-AGENT works

- The learner writes one file, `agent.py`. LAB-01 starts from a short skeleton. Every later milestone opens with **the learner's own code that passed the previous milestone**, under one comment line naming what to add.
- A milestone is **locked** until the previous one has passed. It can be opened deliberately from a reference version of the previous milestone; it then counts as passed with help.
- From LAB-04 a simulated Claude, `fake_claude.py`, is in a read-only tab. It is called exactly like the real client, `client.messages.create(model=..., max_tokens=..., messages=..., tools=...)`, and returns real SDK objects. It refuses badly ordered histories with errors worded like the API's.
- **Run is a conversation**: the learner types to their agent in the Output panel.
- **Tests judge behaviour, not layout.** They type scripted lines into the program and inspect what it printed and what it sent to the simulated Claude. An inline loop and separated functions both pass until LAB-12 asks for the reorganised form.
- A **Changes** tab shows line by line what has changed since the milestone opened.
- **Checkpoints** at LAB-04, LAB-08 and LAB-12 need a short written account of the flow.
- From LAB-10 a separate **Run live…** button runs the agent with the real Claude. It asks for confirmation every time and uses the key saved in the app. Run and Check tests are always simulated. The tools remain simulated instruments either way.
- Fixed things the tests rely on: lines from the agent start with `Agent:`; `quit` prints `Goodbye`; from LAB-10 the first line printed contains `simulated` or `LIVE`. Named functions: `read_balance`, `run_tool`, `make_tool_result` (LAB-06 to LAB-08), `check_temperature`, `call_claude`, `ask`. Named variables: `tools`, `rules`.

## Where the course separates Claude, the Python application and the instrument functions

This is the distinction the review asked about. Where it is taught explicitly:

| Where | What the learner sees or does |
|---|---|
| 3P-A | "The idea" names three parties: Anthropic defines the message format; the developer defines the tools and writes the Python; Claude decides whether to ask, which tool, and what argument values. The learner reads a definition and a request side by side and writes who defines what. |
| 3P-B, 3P-C | The learner writes tool definitions, so `block.input` is seen as a consequence of what they declared. |
| 3P-D | The same request fits one definition and not another. |
| 3P-E | A declared tool with no Python function: a definition does not create a function. `read_balance()` takes no arguments because its definition declares none. |
| 3P-F | A misspelled name makes the program silently do nothing: definition, request and Python must agree. |
| LAB-02 | The learner writes the instrument function and runs it from a hard-wired word. The lesson says: for now *you* decide when it runs. |
| LAB-04 | Claude's request is printed and **nothing runs**. The checkpoint asks: who decided the balance should be read, and what does your program do about it so far? |
| LAB-05 | The application runs the tool: `run_tool` is the only place that maps a name to a function. |
| LAB-06, LAB-07 | "Claude cannot see what you printed": the application packages the result and sends it back. |
| LAB-12 | The learner finds the same three roles in two other arrangements, including the SDK tool runner. |

Known weaknesses, for the reviewer to judge:

1. **The three roles are named as Anthropic / developer / Claude, not as Claude / application / instrument function.** The split between the application (`run_tool`, the loop) and the instrument function (`read_balance`) is built in LAB-02 and LAB-05 but is never stated in one sentence anywhere.
2. **Module 2 comes before 3P.** Exercises 2D to 2F already read `block.input["balance_id"]`, before 3P-A explains where that key comes from. A learner following the list in order meets the confusion first and the explanation second.
3. **The original exercises 3A to 5G do not repeat the framing.** They were left exactly as in the pack.
4. **The "why this matters" notes are collapsed by default**, so the one-line framing each exercise has may go unread.

## Other gaps known to the builder

- **Reading real Python** is now covered by 7R-A to 7R-F, at recognition level only. They come before 7A in the list, but LAB-12's `other_tool_runner.py` (a decorator, type hints, an f-string) is suggested after 7E, so the order holds.
- **Evaluation** is covered only for deterministic, simulated agents: module 8 (assertions, table-driven cases, a dispatcher case matrix, a history validator, a flaky-failure reproduction) and mock 9C (score an unreliable agent on ten scenarios, fix one cause, score again). Nothing yet evaluates the real model: no repeated live runs, no grading of free-text answers, no measuring whether a prompt or description change helped.
- **`tool_choice` and `strict`** are not covered. The tool runner is covered for reading only, in LAB-12.
- **Live behaviour:** a real request happens only through Run live from LAB-10. It has not been tried with a real key by the builder. 5G remains an offline check against a fake client.
- **Prompting** is one milestone (LAB-11). The simulated Claude can only prove the system prompt arrives; seeing a rule change behaviour needs a live run.
- **Written answers** (3F, 3P-A, 7F, 8F, the mocks, the LAB checkpoints) get a rough keyword check only. The mentor's reading should override it.
- **No person has worked through the new exercises yet.** They were verified by automation: every reference version passes, every starter fails, and recorded wrong versions are rejected.

## Suggested order

Numbered exercises in list order, with each LAB milestone placed after the exercise it is suggested after. **Bold** is the core route; the rest deepen it. Nothing enforces this order except that each LAB milestone needs the one before it.

{order}

## The simulated Claude (`fake_claude.py`), in brief

It is keyword-based and deterministic:

- A question mentioning weigh, mass, balance or reading, when a `read_balance` tool was offered: it requests `read_balance` with `{{}}`.
- A question mentioning temperature, when `check_temperature` was offered: it requests it with a `sensor_id` taken from the question (for example TEMP07).
- "twice": it asks again after the first result.
- Tool results sent back: it answers in words, quoting the results. A result marked `is_error` is reported as a failure and not retried.
- "who are you?": it quotes the first sentence of the system prompt, or says it was given none.
- "what was the first thing I asked?": it answers from the messages it was sent, which shows that the history is its only memory.
- Weighing asked for but no tools sent: it says no tool was offered.
- It raises `BadRequestError` for an empty history, a wrong role, roles that do not alternate, a `tool_use` without a matching `tool_result` in the next message, a `tool_result` with an unknown id, or result content that is not text.

For tests of failure handling, the checker scripts it to request an unknown tool or to leave out an argument.

---

# Every exercise and milestone

'''


def main(out):
    manifest, info, core, why = load()
    os.makedirs(out, exist_ok=True)
    exercises = manifest["exercises"]
    order = suggested_order(exercises)
    rows = []
    for module in manifest["modules"]:
        if module["id"] == "LAB":
            continue
        members = [e for e in order if e["module"] == module["id"] or (e["module"] == "LAB" and any(x["id"] == e.get("after") and x["module"] == module["id"] for x in exercises))]
        shown = ", ".join(f"**{e['id']}**" if e["id"] in core else e["id"] for e in members)
        rows.append(f"- Module {module['id']}, {module['name']}: {shown}")
    text = INTRO.format(today=date.today().isoformat(), total=len(exercises), python=info["python"], sdk=info["anthropic"], order="\n".join(rows))
    parts = [text]
    for module in manifest["modules"]:
        parts.append(f"## Module {module['id']}: {module['name']}\n\n{module['goal']}\n")
        for e in exercises:
            if e["module"] == module["id"]:
                parts.append(exercise_section(e, info, core, why))
    overview = os.path.join(out, "Course_Overview.md")
    with open(overview, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(parts).rstrip() + "\n")
    shutil.copyfile(os.path.join(CURRICULUM, "manifest.json"), os.path.join(out, "Course_Exercises.json"))
    print(f"Wrote {overview} ({os.path.getsize(overview)} bytes) and Course_Exercises.json; {len(exercises)} exercises, {len(info['implemented'])} with tests.")


if __name__ == "__main__":
    main(sys.argv[1])
