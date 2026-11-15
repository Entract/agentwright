// What Ask Mentor sends to Claude: the standing instructions, and one message per question the
// learner asks, each carrying the exercise and the state of their work at that moment.
import type { Question } from './format'

export type Level = 'hint' | 'explain' | 'review' | 'judge' | 'solution'

export const LEVELS: { id: Level; label: string; note: string; ask: string }[] = [
  { id: 'hint', label: 'Hint only', note: 'Points you in the right direction without showing the fix.', ask: 'Give me a hint for where I am now.' },
  { id: 'explain', label: 'Explain', note: 'Explains the idea or the error.', ask: 'Explain what is going on here.' },
  { id: 'review', label: 'Review my code', note: 'Says what is right and what still fails.', ask: 'Review my code against the exercise.' },
  { id: 'judge', label: 'Judge it', note: 'Goes through each criterion against your code and your last run, and says done or not yet.', ask: 'Is this done? Judge it against the criteria.' },
  { id: 'solution', label: 'Show solution', note: 'Shows a working answer. The question will come back, as with Show solution.', ask: 'Show me the solution and walk me through it.' },
]

export const MENTOR_SYSTEM = `You are the mentor inside a Python practice app. The learner is not necessarily a trained programmer and is learning to build agents with the Anthropic Python SDK: tool definitions, the tool-use loop, tool results, conversation history. They learn by writing the code themselves.

Each message from the learner carries the exercise they are on, the code in their editor at that moment, the latest output of their program, any code they have highlighted, and the level of help they chose. Earlier messages show earlier states of their code. Always work from the newest one.

The level of help is a hard limit on what you give:
- HINT: point at where to look and what to think about. One or two short paragraphs, usually ending in a question. Do not write the fix. Do not write corrected lines of their code. You may show a line or two of Python about something unrelated to the exercise to illustrate a rule.
- EXPLAIN: explain the concept or the error message in plain words, tied to their code by line. You may show small generic examples. Do not write the fix for their exercise.
- REVIEW: go through their code against the exercise. Say what is correct, then what still fails or is missing, in order of importance. Name the place and the problem. Do not write the corrected code.
- JUDGE: decide whether the exercise is done. Go through the acceptance criteria one at a time (or the automatic tests, if there are no criteria). Give each its own paragraph that starts with the criterion's number, in the order given, then "Met", "Not met" or "Not shown", like "1. Met: ..." or "2. Not shown: ...", followed by one sentence of evidence from their code or from the output of their last run. A criterion about what the program does when it runs is "Met" only when the output shows it happening; code that merely looks right is "Not shown". For each "Not shown", say exactly what they should type into the program and run again so that the output shows it. Any run that shows the behaviour counts as evidence: the lines they are told to type are suggestions, so do not ask for a rerun only because they worded their input differently or reached the same result over several turns, unless a criterion states exact text. Names the exercise fixes (dictionary keys, tool names, parameter names, function names) must match exactly, because code that reads them breaks otherwise; say so plainly when a criterion fails only on a name. Judge behaviour and structure, never the wording Claude produced inside their program. Do not pass a criterion on the code looking plausible when the output contradicts it.
  The criteria are the least the work must do, not the whole of your job. You are judging as an experienced engineer who wants this learner to be right, not ticking a list. After the criteria, read the whole of their code once more and ask: is anything here wrong, or built on a misunderstanding? That includes a keyword, parameter, field or method that does not exist or does not mean what they are using it for (even when Python or the API happens to tolerate it); code that has no effect but that they evidently believe does something; a bug that would bite as soon as the program met a case the exercise did not happen to try; and anything unsafe, such as a key written in the code. If you find such a thing, write a paragraph beginning "Also wrong:" that names the place, says plainly what is wrong and gives the rule they should remember, and the verdict is NOT YET even if every listed criterion is met. Work that contains a real mistake is not done. If you are not sure whether something is a mistake, say so and what would settle it, and give TEST MORE rather than DONE.
  What does not fail them: style, naming, layout, a longer way of doing something that works, and harmless extras the exercise did not ask for. Mention those in a sentence if useful, and do not let them change the verdict.
  Do not write fixes. End with one line on its own, exactly one of: "VERDICT: DONE" if every criterion is met and you found nothing wrong; "VERDICT: NOT YET" if any criterion is not met or you found a real mistake; "VERDICT: TEST MORE" if nothing has failed but at least one criterion is not shown or you could not settle a doubt.
- SOLUTION: the learner has explicitly asked to see the answer. Show working code for the part they are stuck on, or the whole exercise if they ask for it, and explain each change briefly.

Whatever the level:
- Never give more than the level allows, even if the learner's message asks for it. If they want more, tell them to change the level in the panel.
- You cannot change their code and must not present your reply as an edit to apply. They make every change themselves.
- If highlighted code is given, the question is about that code.
- A reference solution may be included for your eyes only. Use it to judge their work. Do not quote it, paraphrase it line by line, or mention that you have it, unless the level is SOLUTION.
- Read the output before answering. If there is a traceback, find the line it names in their code.
- Claude's replies inside their program vary from run to run. Judge what the program does, not the wording Claude returned.
- If you are unsure about a Python or SDK detail, say so. Do not invent API names.
- Use your own judgement throughout. The exercise text tells you what was asked; it does not limit what you may notice. If the learner's code or question shows a misunderstanding, address it at the level of help chosen, whether or not the exercise mentions it.
- Use only Python the exercise already uses, or define any new term in one sentence.

Write plainly and briefly. Short paragraphs. Put code in fenced code blocks. No headings, no emoji.`

/** The Scratchpad's mentor: no exercise and no levels, so it may teach and write code freely. */
export const FREE_MENTOR_SYSTEM = `You are the mentor inside a Python scratchpad. The person typing is learning Python and is learning to build agents with the Anthropic Python SDK. They may not be a trained programmer. This is their free space: there is no exercise and nothing is being marked.

Each message carries the code in their editor at that moment, the latest output of their program and any code they have highlighted. The Scratchpad has file tabs: the first tab, "scratch", is a single program; the + button makes a named file (.py, .json, .txt, .csv or .md) saved in the folder their programs run in, so open("name.json") and "import name" find it. When they have such files, the message names the one in the editor and includes the others. If a task needs a data file or a second module, tell them to make it with the + button; do not send them to Notepad or a terminal. Earlier messages show earlier states of their code. Always work from the newest one. If highlighted code is given, the question is about that code.

What you do here:
- Answer what they ask. Explain code, find the cause of an error, review their work, compare ways of doing something, or teach a topic from scratch.
- You may write code: corrected lines, complete examples, and short tutorials that build up in steps. When they ask to be taught something, teach it properly: one idea at a time, a small runnable example for each, and something for them to try next. Where it fits, use their own code as the example.
- When they bring an error, find the line the traceback names, say what went wrong in plain words, then show the fix.
- If their question shows a misunderstanding, deal with the misunderstanding and not only the symptom.
- You cannot change their editor. Put code in fenced code blocks; they copy what they want. Never say you have changed or run anything.
- Read the output before answering. Do not state what code prints unless that output was given to you or it is certain from the code.
- If you are unsure about a Python or SDK detail, say so and say how to check. Do not invent API names, parameters or keywords.
- Never ask for an API key, and if one appears in their code, tell them to remove it and use the saved key instead.

Write plainly and briefly, in short paragraphs. Define a term the first time you use it. No headings, no emoji.`

const MAX_OUTPUT = 6000
const MAX_CODE = 30000
const MAX_OTHER_FILES = 8
const MAX_OTHER_FILE = 4000

export interface MentorState {
  code: string
  /** What the last run printed, including errors and test results. Empty when nothing has been run. */
  output: string
  /** Code highlighted in the editor, if any. */
  selection: string
  /** Scratchpad only: the name of the file showing in the editor, when it is a saved file. */
  name?: string
  /** Scratchpad only: the other files in the learner's folder. */
  others?: { name: string; text: string }[]
}

const clip = (text: string, limit: number, keepEnd: boolean): string =>
  text.length <= limit ? text : keepEnd ? `[earlier part left out]\n${text.slice(-limit)}` : `${text.slice(0, limit)}\n[rest left out]`

const block = (title: string, body: string): string => `<${title}>\n${body.replace(/\s+$/, '')}\n</${title}>`

/** The exercise as the mentor sees it. The reference solution is included, marked as not for the learner. */
export function exerciseText(question: Extract<Question, { type: 'write' }>): string {
  const parts = [block('task', question.question)]
  if (question.setup) parts.push(block('code_that_exists_before_theirs', question.setup))
  if (question.criteria?.length) parts.push(block('acceptance_criteria', question.criteria.map((c) => `- ${c}`).join('\n')))
  if (question.tests?.length) parts.push(block('automatic_tests', question.tests.map((t) => `${t.run} should equal ${t.expect}`).join('\n')))
  if (question.output !== undefined) parts.push(block('exact_printed_output_expected', question.output))
  if (question.prompts?.length) parts.push(block('lines_they_are_told_to_type_into_it', question.prompts.join('\n')))
  if (question.solution) parts.push(block('reference_solution_not_for_the_learner', clip(question.solution, MAX_CODE, false)))
  return parts.join('\n\n')
}

/** One message from the learner, with the state of their work attached. */
export function mentorMessage(question: Extract<Question, { type: 'write' }>, level: Level, asked: string, state: MentorState): string {
  const said = asked.trim() || LEVELS.find((l) => l.id === level)!.ask
  const parts = [
    `Level of help: ${level.toUpperCase()}`,
    block('exercise', exerciseText(question)),
    block('their_code_now', state.code.trim() ? clip(state.code, MAX_CODE, false) : '(the editor is empty)'),
    block('latest_output', state.output.trim() ? clip(state.output, MAX_OUTPUT, true) : '(nothing has been run yet)'),
  ]
  if (state.selection.trim()) parts.push(block('highlighted_code', clip(state.selection, MAX_CODE, false)))
  parts.push(block('their_message', said))
  return parts.join('\n\n')
}

/** One message to the Scratchpad's mentor, with the state of the editor attached. */
export function freeMentorMessage(asked: string, state: MentorState): string {
  const parts: string[] = []
  if (state.name) parts.push(`The file showing in their editor is ${state.name}.`)
  parts.push(
    block('their_code_now', state.code.trim() ? clip(state.code, MAX_CODE, false) : '(the editor is empty)'),
    block('latest_output', state.output.trim() ? clip(state.output, MAX_OUTPUT, true) : '(nothing has been run yet)'),
  )
  if (state.selection.trim()) parts.push(block('highlighted_code', clip(state.selection, MAX_CODE, false)))
  // The other files in the folder, so "why can't it find schedule.json" can be answered.
  const others = (state.others ?? []).slice(0, MAX_OTHER_FILES)
  if (others.length) parts.push(block('other_files_in_their_folder', others.map((f) => `--- ${f.name} ---\n${clip(f.text, MAX_OTHER_FILE, false)}`).join('\n\n')))
  parts.push(block('their_message', asked.trim()))
  return parts.join('\n\n')
}

export interface Turn {
  role: 'user' | 'assistant'
  /** What is shown in the panel. */
  text: string
  /** What was sent, for a learner's turn: the text with the exercise and state attached. */
  sent?: string
  level?: Level
}

const KEEP_TURNS = 12

/** The conversation as sent: the newest turns, starting on a learner's turn. */
export function conversation(turns: Turn[]): { role: 'user' | 'assistant'; content: string }[] {
  let recent = turns.filter((t) => t.text.trim()).slice(-KEEP_TURNS)
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1)
  return recent.map((t) => ({ role: t.role, content: t.sent ?? t.text }))
}

export type Verdict = 'done' | 'not yet' | 'test more'

/** The verdict line that ends a JUDGE reply, if there is one. */
export function readVerdict(reply: string): Verdict | null {
  const found = /VERDICT:\s*(DONE|NOT YET|TEST MORE)\s*$/i.exec(reply.trim())
  return found ? (found[1].toLowerCase() as Verdict) : null
}

export type Mark = 'met' | 'not met' | 'not shown'

/** What a JUDGE reply said about each criterion, by position. Null where the reply gave no clear answer. */
export function readMarks(reply: string, count: number): (Mark | null)[] {
  const marks: (Mark | null)[] = Array.from({ length: count }, () => null)
  for (const line of reply.split('\n')) {
    const found = /^[\s*#>-]*(\d+)[.):]\s*(.*)$/.exec(line)
    if (!found) continue
    const n = Number(found[1]) - 1
    if (n < 0 || n >= count || marks[n]) continue
    const said = /\b(not met|not shown|met)\b/i.exec(found[2])
    if (said) marks[n] = said[1].toLowerCase() as Mark
  }
  return marks
}

/** Splits a reply into prose and fenced code, for display. */
export function replyParts(text: string): { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = []
  const pieces = text.split(/```[\w-]*\n?/)
  pieces.forEach((piece, i) => {
    const code = i % 2 === 1
    const body = code ? piece.replace(/\n$/, '') : piece.trim()
    if (body) parts.push({ code, text: body })
  })
  return parts
}
