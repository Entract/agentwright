import { beforeAll, describe, expect, it } from 'vitest'
import { runWithPyodide, type PyodideLike, type RunRequest } from '../runner/core'
import { testPyodide } from '../runner/testPyodide'
import { GAPS, MENTOR_INSTRUCTIONS, addSet, cardKey, dueNow, emptyStore, extractJson, needsPerson, parseSet, parseStore, pcCheckScript, readPcCheck, record, removeSet, sameOutput, selfJudged, setSummary, writeRun, type Question } from './format'
import { findFaults } from './Revision'
import sample from './sample-set.json'
import { READY_MADE } from './readyMade'

const text = JSON.stringify(sample)

describe('reading a set', () => {
  it('reads the sample set', () => {
    const parsed = parseSet(text)
    expect(parsed.title).toBe('Sample: dictionaries and a guard function')
    expect(parsed.questions.map((q) => q.type)).toEqual(['recall', 'choice', 'predict', 'predict', 'write'])
    expect(parsed.problems).toEqual([])
  })

  it('accepts a whole chat reply: prose, a code fence, or a bare list', () => {
    expect(parseSet('Here you go!\n```json\n' + text + '\n```\nGood luck.').questions).toHaveLength(5)
    expect(parseSet('Sure: ' + text + ' Let me know.').questions).toHaveLength(5)
    expect(parseSet(JSON.stringify(sample.questions)).title).toBe('Untitled set')
    expect(extractJson('```\n[1]\n```')).toBe('[1]')
  })

  it('accepts a choice answer given as the option text', () => {
    const parsed = parseSet(JSON.stringify({ questions: [{ type: 'choice', question: 'q', options: ['a', 'b'], answer: 'b' }] }))
    expect(parsed.questions[0]).toMatchObject({ answer: 1 })
  })

  it('leaves out unusable questions and says why', () => {
    const extra = [{ type: 'write', question: 'no tests', solution: 'x = 1' }, { type: 'essay', question: 'q' }, { type: 'choice', question: 'q', options: ['a', 'b'], answer: 5 }]
    const parsed = parseSet(JSON.stringify({ title: 't', questions: [...sample.questions, ...extra] }))
    expect(parsed.questions).toHaveLength(5)
    expect(parsed.problems).toHaveLength(3)
    expect(parsed.problems[0]).toContain('Question 6')
  })

  it('refuses text with nothing usable, in plain words', () => {
    expect(() => parseSet('not json at all')).toThrow(/not valid JSON/)
    expect(() => parseSet('{"title": "x"}')).toThrow(/No "questions"/)
    expect(() => parseSet('{"questions": [{"type": "recall"}]}')).toThrow(/None of the 1/)
  })

  it('gives the mentor instructions that describe every type', () => {
    for (const word of ['recall', 'choice', 'predict', 'write', '"tests"', '"solution"']) expect(MENTOR_INSTRUCTIONS).toContain(word)
  })
})

describe('questions the learner judges', () => {
  const agent = { type: 'write', question: 'Make the loop handle every tool request.', starter: 'import anthropic\n', solution: 'import anthropic\n' }

  it('accepts a write question with criteria in place of tests, under either name', () => {
    const own = parseSet(JSON.stringify({ questions: [{ ...agent, criteria: ['Prints the final answer'], prompts: ['Read it twice'] }] })).questions[0]
    expect(own).toMatchObject({ type: 'write', criteria: ['Prints the final answer'], prompts: ['Read it twice'], tests: [] })
    const other = parseSet(JSON.stringify({ questions: [{ ...agent, acceptance_criteria: ['A', 'B'], manual_test_prompts: ['Hi'], grading: 'manual_live' }] })).questions[0]
    expect(other).toMatchObject({ criteria: ['A', 'B'], prompts: ['Hi'] })
    expect(selfJudged(other)).toBe(true)
    expect(selfJudged(parseSet(text).questions[4])).toBe(false)
  })

  it('still refuses a write question with nothing to check it against', () => {
    expect(() => parseSet(JSON.stringify({ questions: [agent] }))).toThrow(/"tests", "output" or "criteria"/)
  })
})

describe('the schedule', () => {
  const store = addSet(emptyStore(), parseSet(text), 1000)
  const id = store.sets[0].id

  it('offers every new question, and survives saving and loading', () => {
    expect(dueNow(store, 2000)).toHaveLength(5)
    expect(parseStore(JSON.stringify(store))).toEqual(store)
    expect(parseStore('rubbish')).toEqual(emptyStore())
  })

  it('brings a right answer back after longer gaps and a miss straight away, first', () => {
    let s = record(store, cardKey(id, 0), true, 5000)
    expect(dueNow(s, 6000).map((p) => p.index)).toEqual([1, 2, 3, 4])
    expect(dueNow(s, 5000 + GAPS[1]).map((p) => p.index)).toContain(0)
    s = record(s, cardKey(id, 0), true, 5000 + GAPS[1])
    expect(s.cards[cardKey(id, 0)].due).toBe(5000 + GAPS[1] + GAPS[2])
    s = record(s, cardKey(id, 3), false, 9000)
    expect(dueNow(s, 9001)[0].index).toBe(3)
    expect(setSummary(s, id, 9001)).toEqual({ total: 5, passed: 1, due: 4, secure: 1, missed: 1 })
    expect(removeSet(s, id)).toEqual(emptyStore())
  })

  it('compares printed text line by line, ignoring trailing spaces and blank lines', () => {
    expect(sameOutput('True\nFalse', 'True \nFalse\n\n')).toBe(true)
    expect(sameOutput('True', 'true')).toBe(false)
  })
})

describe('checking code with Python', () => {
  let py: PyodideLike
  const run = async (request: RunRequest) => runWithPyodide(py, request)
  const write = parseSet(text).questions[4] as Extract<Question, { type: 'write' }>

  beforeAll(async () => {
    py = await testPyodide()
  }, 120000)

  it('passes the solution and fails the starter and a half-right answer', async () => {
    const check = async (code: string) => {
      const request = writeRun(write, code)
      return (await run({ code: request.code, tests: request.tests })).tests.map((t) => t.passed)
    }
    expect(await check(write.solution)).toEqual([true, true])
    expect(await check(write.starter ?? '')).toEqual([false, false])
    expect(await check('def safe_double(args):\n    return double(args["n"])\n')).toEqual([true, false])
  })

  it('says what a failed test gave and what was expected', async () => {
    const request = writeRun(write, 'def safe_double(args):\n    return 1\n')
    const result = await run({ code: request.code, tests: request.tests })
    expect(result.tests[0].message).toBe('it gave 1, expected 8')
  })

  it('checks printed output when the question asks for it', async () => {
    const q: Extract<Question, { type: 'write' }> = { type: 'write', question: 'print hi', output: 'hi', solution: 'print("hi")' }
    const good = writeRun(q, 'print("hi")')
    expect((await run({ code: good.code, tests: good.tests })).tests[0].passed).toBe(true)
    const bad = writeRun(q, 'print("ho")')
    expect((await run({ code: bad.code, tests: bad.tests })).tests[0].passed).toBe(false)
  })

  it('ships the lessons and the drill as ready-made sets, in order, that import whole and run clean', async () => {
    // A copy of the app without the lesson files has nothing to ship, and nothing to check.
    if (READY_MADE.length === 0) return
    expect(READY_MADE.map((r) => r.file)).toEqual([
      'Lesson_1_Dates_and_Times.json',
      'Lesson_2_Tables_of_Data.json',
      'Lesson_3_Text_and_Logs.json',
      'Lesson_4_Errors_and_Guards.json',
      'Lesson_5_Reading_Starter_Code.json',
      'Lesson_6_Design_Tradeoffs.json',
      'Lesson_7_Data_Filter_and_Validate.json',
      'Lesson_8_Data_Count_and_Summarise.json',
      'Lesson_9_Data_Parse_and_Update.json',
      'Lesson_10_Logic_and_Loops.json',
      'Lesson_11_Tool_Functions.json',
      'Lesson_12_Agent_Plumbing.json',
      'Sight_Reading_Python.json',
    ])
    for (const r of READY_MADE) {
      const parsed = parseSet(r.text)
      expect(parsed.problems, r.file).toEqual([])
      expect(parsed.questions, r.file).toHaveLength(r.count)
      expect(await findFaults(parsed.questions, run), r.file).toEqual({})
    }
  }, 600_000)

  it('finds no faults in the sample, and flags a question whose own solution fails', async () => {
    const questions = parseSet(text).questions
    expect(await findFaults(questions, run)).toEqual({})
    const broken: Question[] = [
      { ...write, solution: 'def safe_double(args):\n    return 0\n' },
      { type: 'predict', question: 'q', code: 'print(' },
      { type: 'predict', question: 'q', code: 'print(nope)' },
    ]
    const faults = await findFaults(broken, run)
    expect(Object.keys(faults)).toEqual(['0', '1'])
    expect(faults[0]).toContain('fails its test')
  })
  it("gives the same verdicts when the check is one program for the PC's Python", async () => {
    const check = async (code: string) => {
      const out = (await run({ code: pcCheckScript(write, code) })).stdout
      return readPcCheck(write, out)
    }
    expect((await check(write.solution))?.every((t) => t.passed)).toBe(true)
    const starter = await check(write.starter ?? '')
    expect(starter?.some((t) => !t.passed)).toBe(true)
    expect(starter?.find((t) => !t.passed)?.message).toMatch(/it gave|Error/)
    // A program that stops before the tests gives no verdict at all.
    expect(readPcCheck(write, 'some output, then a traceback')).toBeNull()
  })

  it('compares printed text in a PC check, leaving the result line out of it', async () => {
    const q = { type: 'write', question: 'Print hi twice', output: 'hi\nhi', solution: 'print("hi")\nprint("hi")' } as Extract<Question, { type: 'write' }>
    const good = (await run({ code: pcCheckScript(q, q.solution) })).stdout
    expect(readPcCheck(q, good)).toEqual([{ name: 'What the program prints', passed: true, message: '' }])
    const bad = (await run({ code: pcCheckScript(q, 'print("hi")') })).stdout
    expect(readPcCheck(q, bad)?.[0].passed).toBe(false)
  })

  it('leaves questions that call Claude or wait for typing out of the import check', async () => {
    const live: Question[] = [
      { type: 'write', question: 'Ask Claude', tests: [{ run: 'isinstance(reply, str)', expect: 'True' }], solution: 'import anthropic\nclient = anthropic.Anthropic()\nreply = "x"' },
      { type: 'write', question: 'Ask me', output: 'x', solution: 'name = input("Name: ")\nprint(name)' },
    ]
    expect(live.map(needsPerson)).toEqual([true, true])
    expect(needsPerson(write)).toBe(false)
    expect(await findFaults(live, run)).toEqual({})
  })
})
