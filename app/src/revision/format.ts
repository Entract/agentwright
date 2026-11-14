// Revision sets: questions written by a mentor (a person or an AI) as one JSON file, imported
// into the app and practised with repeats. This file is the format, its reader and the schedule.
import type { TestSpec } from '../types'

export type Question =
  | { type: 'recall'; topic?: string; question: string; code?: string; answer: string }
  | { type: 'choice'; topic?: string; question: string; code?: string; options: string[]; answer: number; why?: string }
  | { type: 'predict'; topic?: string; question: string; code: string; why?: string }
  | {
      type: 'write'
      topic?: string
      question: string
      /** Code that exists before the learner's code runs. It is shown to the learner. */
      setup?: string
      starter?: string
      /** Each test evaluates `run` and compares it with `expect`. Both are Python expressions. */
      tests?: { run: string; expect: string }[]
      /** The exact text the program should print, if printing is the point. */
      output?: string
      /** What the finished program must do, for the learner to judge. Used when there is nothing to test automatically. */
      criteria?: string[]
      /** Lines worth typing into the running program to try it. */
      prompts?: string[]
      /** A full answer. Empty only for a question the learner judges against criteria. */
      solution: string
      why?: string
    }

export interface RevisionSet {
  id: string
  title: string
  addedAt: number
  questions: Question[]
  /** Questions whose own code failed when the set was imported: position -> what went wrong. */
  faults?: Record<number, string>
}

export interface CardState {
  /** 0 = new or missed; higher boxes come back after longer gaps. */
  box: number
  due: number
  right: number
  wrong: number
  last?: number
}

export interface Store {
  version: 1
  sets: RevisionSet[]
  cards: Record<string, CardState>
}

export const emptyStore = (): Store => ({ version: 1, sets: [], cards: {} })

export function parseStore(text: string | null | undefined): Store {
  if (!text) return emptyStore()
  try {
    const value = JSON.parse(text) as Store
    if (value && value.version === 1 && Array.isArray(value.sets) && value.cards && typeof value.cards === 'object') return value
  } catch {
    // Unreadable: start empty rather than fail to open.
  }
  return emptyStore()
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const texts = (value: unknown): string[] | undefined => {
  const list = Array.isArray(value) ? value.filter(isText) : isText(value) ? [value] : []
  return list.length ? list : undefined
}

/** Takes the JSON out of whatever was pasted: a code fence, or prose around the braces. */
export function extractJson(text: string): string {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text)
  const body = (fence ? fence[1] : text).trim()
  if (body.startsWith('{') || body.startsWith('[')) return body
  const start = body.search(/[{[]/)
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'))
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

export interface Parsed {
  title: string
  questions: Question[]
  /** Questions that were left out, each with the reason. */
  problems: string[]
}

function readQuestion(raw: unknown, n: number): Question | string {
  const where = `Question ${n}`
  if (!raw || typeof raw !== 'object') return `${where}: not an object.`
  const q = raw as Record<string, unknown>
  const topic = isText(q.topic) ? q.topic.trim() : undefined
  const why = isText(q.why) ? q.why : undefined
  const code = isText(q.code) ? q.code : undefined
  if (!isText(q.question)) return `${where}: it has no "question" text.`
  const question = q.question
  switch (q.type) {
    case 'recall':
      if (!isText(q.answer)) return `${where} (recall): it has no "answer" text.`
      return { type: 'recall', topic, question, code, answer: q.answer }
    case 'choice': {
      if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) return `${where} (choice): "options" must be a list of at least two texts.`
      const options = q.options as string[]
      // The answer may be given as a position (from 0) or as the text of the right option.
      const answer = typeof q.answer === 'number' ? q.answer : options.indexOf(String(q.answer))
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return `${where} (choice): "answer" must be the position of the right option, counting from 0.`
      return { type: 'choice', topic, question, code, options, answer, why }
    }
    case 'predict':
      if (!code) return `${where} (predict): it has no "code" to run.`
      return { type: 'predict', topic, question, code, why }
    case 'write': {
      const tests: { run: string; expect: string }[] = []
      if (q.tests !== undefined) {
        if (!Array.isArray(q.tests)) return `${where} (write): "tests" must be a list.`
        for (const t of q.tests as Record<string, unknown>[]) {
          if (!t || !isText(t.run) || !isText(t.expect)) return `${where} (write): every test needs "run" and "expect", both as text holding a Python expression.`
          tests.push({ run: t.run, expect: t.expect })
        }
      }
      const output = typeof q.output === 'string' && q.output.length > 0 ? q.output : undefined
      // Sets written for other tools use longer names for the same two lists.
      const criteria = texts(q.criteria) ?? texts(q.acceptance_criteria)
      const prompts = texts(q.prompts) ?? texts(q.manual_test_prompts)
      // A reference answer is needed to prove that tests can be passed. Criteria need none.
      if (!isText(q.solution) && (tests.length > 0 || output !== undefined)) return `${where} (write): it has "tests" or "output" but no "solution" to prove they can be passed.`
      if (tests.length === 0 && output === undefined && !criteria) return `${where} (write): it needs "tests", "output" or "criteria", otherwise there is nothing to check it against.`
      return { type: 'write', topic, question, setup: isText(q.setup) ? q.setup : undefined, starter: typeof q.starter === 'string' ? q.starter : undefined, tests, output, criteria, prompts, solution: isText(q.solution) ? q.solution : '', why }
    }
    default:
      return `${where}: "type" must be recall, choice, predict or write; it is ${JSON.stringify(q.type)}.`
  }
}

/** Reads a pasted or imported set. Throws with a plain message when nothing usable is in it. */
export function parseSet(text: string): Parsed {
  let value: unknown
  try {
    value = JSON.parse(extractJson(text))
  } catch (err) {
    throw new Error(`This is not valid JSON, so nothing was imported. ${(err as Error).message}`)
  }
  const object = (Array.isArray(value) ? { questions: value } : value) as Record<string, unknown> | null
  if (!object || typeof object !== 'object' || !Array.isArray(object.questions)) throw new Error('No "questions" list was found, so nothing was imported.')
  const questions: Question[] = []
  const problems: string[] = []
  ;(object.questions as unknown[]).forEach((raw, i) => {
    const read = readQuestion(raw, i + 1)
    if (typeof read === 'string') problems.push(read)
    else questions.push(read)
  })
  if (questions.length === 0) throw new Error(`None of the ${object.questions.length} questions could be used. ${problems.slice(0, 3).join(' ')}`)
  return { title: isText(object.title) ? object.title.trim() : 'Untitled set', questions, problems }
}

export function addSet(store: Store, parsed: Parsed, now: number): Store {
  const id = `s${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
  return { ...store, sets: [...store.sets, { id, title: parsed.title, addedAt: now, questions: parsed.questions }] }
}

export function removeSet(store: Store, setId: string): Store {
  const cards = Object.fromEntries(Object.entries(store.cards).filter(([key]) => !key.startsWith(`${setId}:`)))
  return { ...store, sets: store.sets.filter((s) => s.id !== setId), cards }
}

export const cardKey = (setId: string, index: number): string => `${setId}:${index}`

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
/** How long until a question in each box comes back. A miss goes to box 0. */
export const GAPS = [0, 10 * MINUTE, DAY, 3 * DAY, 7 * DAY]

export function record(store: Store, key: string, correct: boolean, now: number): Store {
  const old = store.cards[key] ?? { box: 0, due: 0, right: 0, wrong: 0 }
  const box = correct ? Math.min(old.box + 1, GAPS.length - 1) : 0
  const card: CardState = { box, due: now + GAPS[box], right: old.right + (correct ? 1 : 0), wrong: old.wrong + (correct ? 0 : 1), last: now }
  return { ...store, cards: { ...store.cards, [key]: card } }
}

export interface Pick {
  key: string
  setId: string
  setTitle: string
  index: number
  question: Question
}

function allPicks(store: Store, setId?: string): Pick[] {
  return store.sets
    .filter((s) => !setId || s.id === setId)
    .flatMap((s) => s.questions.map((question, index) => ({ key: cardKey(s.id, index), setId: s.id, setTitle: s.title, index, question })))
}

/** Questions that are due now: missed ones first, then ones never seen, then the rest by how overdue they are. */
export function dueNow(store: Store, now: number, setId?: string): Pick[] {
  const rank = (p: Pick): [number, number] => {
    const card = store.cards[p.key]
    if (!card) return [1, 0]
    return [card.box === 0 ? 0 : 2, card.due]
  }
  return allPicks(store, setId)
    .filter((p) => (store.cards[p.key]?.due ?? 0) <= now)
    .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])
}

/** Every question of a set, whether or not it is due. */
export function wholeSet(store: Store, setId: string): Pick[] {
  return allPicks(store, setId)
}

export function setSummary(store: Store, setId: string, now: number): { total: number; due: number; secure: number; missed: number } {
  const picks = allPicks(store, setId)
  let due = 0
  let secure = 0
  let missed = 0
  for (const p of picks) {
    const card = store.cards[p.key]
    if (!card || card.due <= now) due++
    if (card && card.box >= 2) secure++
    if (card && card.box === 0 && card.wrong > 0) missed++
  }
  return { total: picks.length, due, secure, missed }
}

/** The run that checks a write question. The setup is put above the learner's code. */
export function writeRun(question: Extract<Question, { type: 'write' }>, code: string): { code: string; tests: TestSpec[]; setupLines: number } {
  const setup = question.setup ? question.setup.replace(/\s+$/, '') + '\n' : ''
  const tests: TestSpec[] = (question.tests ?? []).map((t) => ({
    kind: 'python',
    name: t.run,
    code: `__got = (${t.run})\n__want = (${t.expect})\nassert __got == __want, 'it gave ' + repr(__got) + ', expected ' + repr(__want)`,
  }))
  if (question.output !== undefined) tests.push({ kind: 'stdout', name: 'What the program prints', expect: question.output })
  return { code: setup + code, tests, setupLines: setup ? setup.split('\n').length - 1 : 0 }
}

/** True when a question's code calls Claude or waits for typing, so it needs the PC's Python and a person at the keyboard. */
export function needsPerson(question: Question): boolean {
  const code = question.type === 'write' ? `${question.setup ?? ''}\n${question.starter ?? ''}\n${question.solution}` : question.type === 'predict' ? question.code : ''
  return /^[ \t]*(import|from)[ \t]+anthropic\b/m.test(code) || /\binput\s*\(/.test(code)
}

/** True when nothing can be tested automatically, so the learner judges the result against the criteria. */
export function selfJudged(question: Question): boolean {
  return question.type === 'write' && !question.tests?.length && question.output === undefined
}

/** Starts the line that carries the test results out of a PC run. The page hides everything from this character on. */
export const PC_MARK = '\u001e'
const PC_TAG = `${PC_MARK}REVISION-CHECK`

/** The same check as writeRun, as one program for the PC's Python: the tests run after the learner's code and report on one last line. */
export function pcCheckScript(question: Extract<Question, { type: 'write' }>, code: string): string {
  const setup = question.setup ? question.setup.replace(/\s+$/, '') + '\n' : ''
  const tests = JSON.stringify((question.tests ?? []).map((t) => [t.run, t.expect]))
  return `${setup}${code.replace(/\s+$/, '')}

import json as __json
__results = []
for __run, __expect in __json.loads(${JSON.stringify(tests)}):
    try:
        __got = eval(__run)
        __want = eval(__expect)
        __ok = bool(__got == __want)
        __results.append({"name": __run, "passed": __ok, "message": "" if __ok else "it gave " + repr(__got) + ", expected " + repr(__want)})
    except Exception as __error:
        __results.append({"name": __run, "passed": False, "message": type(__error).__name__ + ": " + str(__error)})
print(${JSON.stringify(PC_TAG)} + __json.dumps(__results), flush=True)
`
}

export interface PcTest {
  name: string
  passed: boolean
  message: string
}

/** Reads the results out of everything a PC check printed. Null when the program never reached the tests. */
export function readPcCheck(question: Extract<Question, { type: 'write' }>, stdout: string): PcTest[] | null {
  const at = stdout.lastIndexOf(PC_TAG)
  if (at < 0) return null
  let tests: PcTest[]
  try {
    tests = JSON.parse(stdout.slice(at + PC_TAG.length).trim()) as PcTest[]
  } catch {
    return null
  }
  if (question.output !== undefined) {
    const printed = stdout.slice(0, at)
    const same = sameOutput(printed, question.output)
    tests.push({ name: 'What the program prints', passed: same, message: same ? '' : `it printed ${JSON.stringify(printed.replace(/\r/g, '').replace(/\n+$/, ''))}` })
  }
  return tests
}

/** Printed text compared the forgiving way: line by line, ignoring spaces at line ends and blank lines at the end. */
export function sameOutput(a: string, b: string): boolean {
  const norm = (text: string) =>
    text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '')
  return norm(a) === norm(b)
}

/** What to give a mentor so that the sets it writes can be imported. */
export const MENTOR_INSTRUCTIONS = `Please turn what we just covered into a revision set for my Python practice app.
Reply with ONE JSON object in a code block and nothing else. The app imports it as it is.

{
  "title": "A short name for this set",
  "questions": [ ...10 to 20 questions... ]
}

Each question is one of four types. Every type may also have "topic" (a word or two).

1. recall: I answer from memory, then compare with your answer.
   {"type": "recall", "question": "...", "answer": "..."}
   Optional: "code" (shown under the question).

2. choice: one right option.
   {"type": "choice", "question": "...", "options": ["...", "...", "..."], "answer": 0, "why": "..."}
   "answer" is the position of the right option, counting from 0. Optional: "code".

3. predict: I type what the code prints. The app runs the code to get the true answer,
   so do not include the output.
   {"type": "predict", "question": "What does this print?", "code": "...", "why": "..."}

4. write: I write code and the app tests it.
   {"type": "write", "question": "...", "setup": "...", "starter": "...",
    "tests": [{"run": "area(2, 3)", "expect": "6"}], "solution": "...", "why": "..."}
   - "setup" is code that already exists before mine runs. It is shown to me. Leave it out if there is none.
   - "starter" is what the editor begins with. Leave it out for an empty editor.
   - Each test has "run" and "expect". Both are Python expressions written as text. The app
     evaluates both after my code has run and compares them with ==.
   - Use "output": "exact printed text" as well as, or in place of, "tests" when printing is the point.
   - "solution" is a full answer that passes every test. The app runs it when the set is imported
     and warns me about any question whose own solution fails.

Rules:
- I learn by writing and running code. Unless I ask for something else, make at least two
  thirds of the questions "write" questions. If we did coding exercises in this session, turn
  each one into a "write" question, with the same task and the expected result as "tests" or
  "output". Use recall and choice only for ideas that cannot be tested by running code.
- Ask the same idea in more than one way: once as recall, once as predict, once as write.
  I often know a thing but do not recognise it when the wording changes.
- Say in the question exactly what I must produce: a function with this name, a variable with this
  name, or printed lines.
- By default use only the Python standard library, with no network, no files, no input() and
  no anthropic import. Such questions also work on my phone. To practise handling a reply from
  Claude without a real call, build a stand-in in "setup", for example with
  types.SimpleNamespace, and tell me in the question what it holds.
- A whole program I talk to (an agent with a chat loop) cannot be tested automatically.
  For those, leave out "tests" and "output" and give "criteria": a list of things the finished
  program must do, each one something that can be seen in the code or seen happening when it
  runs. Add "prompts": a list of lines for me to type into it. I run it, and the app's AI
  mentor judges my code and the output of my run against your criteria, so write them as a
  rubric: one checkable thing per line. "solution" is optional for these questions.
  {"type": "write", "question": "...", "starter": "...", "criteria": ["..."],
   "prompts": ["..."]}
- When I ask for questions that really call Claude: write "import anthropic" and
  "client = anthropic.Anthropic()" as usual, with no key in the code. On my PC the app gives
  my saved key to the program. input() works there too. Claude's wording changes every time,
  so test the shape of the result and never its exact text, for example
  {"run": "isinstance(reply, str) and len(reply) > 0", "expect": "True"}, and do not use
  "output" for these. Say in the question that it needs the PC.
- Code that makes no real call must run in under two seconds. Keep each line of code under
  80 characters.
- Inside JSON text, a new line is written \\n and a double quote is written \\".
`
