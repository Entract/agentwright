import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { seedExerciseById } from '../content'
import { LabDB } from '../db/db'
import { gradeCode, gradeOutput, gradeText } from '../learn/grade'
import { runWithPyodide, type PyodideLike } from '../runner/core'
import { testPyodide } from '../runner/testPyodide'
import { anthropicTutor, buildUserMessage, estimateCost, leaksAnswer, validateFeedback, type TutorClient } from './anthropic'
import type { TutorRequest } from './provider'
import { addUsage, dayOf, DEFAULT_CONFIG, getDailyUsage, overLimit } from './settings'
import { generateVariant } from './variant'

const ex = (id: string) => seedExerciseById.get(id)!

type Body = Anthropic.Beta.MessageCreateParamsNonStreaming

function fakeClient(reply: unknown, over: Partial<Anthropic.Beta.BetaMessage> = {}): TutorClient & { calls: Body[] } {
  const calls: Body[] = []
  return {
    calls,
    async create(body) {
      calls.push(body)
      return {
        id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn',
        content: [{ type: 'text', text: typeof reply === 'string' ? reply : JSON.stringify(reply), citations: null }],
        usage: { input_tokens: 1000, output_tokens: 200 },
        ...over,
      } as unknown as Anthropic.Beta.BetaMessage
    },
  }
}

const wrongAlias = (): TutorRequest => {
  const exercise = ex('alias-predict')
  const answer = '[1, 2]\nTrue False\nTrue'
  return { exercise, answer, grade: gradeOutput(exercise, answer), attemptNumber: 1, hintsShown: 0 }
}

const good = { verdict: 'incorrect', what_was_right: 'You saw that a and c are different objects.', error_type: 'concept', smallest_hint: 'After b = a, how many lists are there?', offer_retry: true }

describe('AI tutor', () => {
  it('uses the model for the wording but keeps the deterministic verdict', async () => {
    const client = fakeClient({ ...good, verdict: 'correct', error_type: 'none' })
    const fb = await anthropicTutor({ client, model: 'claude-opus-5-5' }).feedback(wrongAlias())
    expect(fb.source).toBe('ai')
    expect(fb.verdict).not.toBe('correct')
    expect(fb.smallestHint).toBe(good.smallest_hint)
    expect(fb.offerRetry).toBe(true)
  })

  it('sends one compact message with structured output, and no chat history', async () => {
    const client = fakeClient(good)
    await anthropicTutor({ client, model: 'claude-opus-5-5' }).feedback(wrongAlias())
    const body = client.calls[0]
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.messages).toHaveLength(1)
    expect(body.output_config?.format?.type).toBe('json_schema')
    expect(body.fallbacks).toBe('default')
    expect(String(body.system)).toContain('Do not give the answer')
  })

  it('does not call the model for a correct, deterministically checked answer', async () => {
    const exercise = ex('alias-predict')
    const answer = exercise.expectedOutput!
    const client = fakeClient(good)
    const fb = await anthropicTutor({ client, model: 'claude-opus-5-5' }).feedback({ exercise, answer, grade: gradeOutput(exercise, answer), attemptNumber: 1, hintsShown: 0 })
    expect(client.calls).toHaveLength(0)
    expect(fb.verdict).toBe('correct')
  })

  it('never passes on a hint that reveals the expected output on a wrong attempt', async () => {
    const client = fakeClient({ ...good, smallest_hint: 'The answer is [1, 2, 3] then True False then False.' })
    const fb = await anthropicTutor({ client, model: 'claude-opus-5-5' }).feedback(wrongAlias())
    expect(fb.source).toBe('local')
    expect(fb.smallestHint).not.toContain('[1, 2, 3]')
    expect(fb.note).toContain('gave too much away')
  })

  it('detects leaked solution lines and correct options', () => {
    expect(leaksAnswer(ex('count-high-write'), 'Try: count = count + 1 inside the if.')).toBe(false)
    expect(leaksAnswer(ex('count-high-write'), 'Write print(count_high(measurements)) at the end.')).toBe(true)
    expect(leaksAnswer(ex('while-continue-choice'), 'continue jumps back to the while test with x still 2, so it repeats forever')).toBe(true)
    expect(leaksAnswer(ex('alias-predict'), 'How many lists exist after b = a?')).toBe(false)
  })

  it('lets the model grade a written explanation', async () => {
    const exercise = ex('alias-explain')
    const answer = 'b is just a second label stuck on the identical thing'
    const client = fakeClient({ verdict: 'correct', what_was_right: 'You said both names label one object.', error_type: 'none', smallest_hint: '', offer_retry: false })
    const fb = await anthropicTutor({ client, model: 'claude-opus-5-5' }).feedback({ exercise, answer, grade: gradeText(exercise, answer), attemptNumber: 1, hintsShown: 0 })
    expect(fb.verdict).toBe('correct')
    expect(fb.errorType).toBe('none')
  })

  it('keeps a syntax slip classed as syntax whatever the model says', async () => {
    const py = (await testPyodide()) as PyodideLike
    const exercise = ex('count-high-write')
    const answer = 'def count_high(m)\n    return 0\n'
    const result = runWithPyodide(py, { code: answer, tests: exercise.tests, given: exercise.given })
    const client = fakeClient({ ...good, error_type: 'concept', smallest_hint: 'What does every def line end with?' })
    const fb = await anthropicTutor({ client, model: 'claude-opus-5-5' }).feedback({ exercise, answer, grade: gradeCode(result), attemptNumber: 1, hintsShown: 0 })
    expect(fb.errorType).toBe('syntax')
  })

  it('falls back to the built-in feedback on a malformed reply, a refusal or an API failure', async () => {
    const malformed = await anthropicTutor({ client: fakeClient('not json'), model: 'm' }).feedback(wrongAlias())
    expect(malformed.source).toBe('local')
    expect(malformed.note).toContain('could not be read')

    const refused = await anthropicTutor({ client: fakeClient(good, { stop_reason: 'refusal' }), model: 'm' }).feedback(wrongAlias())
    expect(refused.source).toBe('local')

    const failing: TutorClient = { create: async () => { throw new Error('network down') } }
    const failed = await anthropicTutor({ client: failing, model: 'm' }).feedback(wrongAlias())
    expect(failed.source).toBe('local')
    expect(failed.note).toContain('network down')
    expect(failed.smallestHint).toBeTruthy()
  })

  it('rejects replies with the wrong shape', () => {
    expect(() => validateFeedback({ ...good, verdict: 'great' })).toThrow('unknown verdict')
    expect(() => validateFeedback({ ...good, error_type: 'lazy' })).toThrow('unknown error type')
    expect(() => validateFeedback({ ...good, smallest_hint: 'x'.repeat(601) })).toThrow('too long')
    expect(() => validateFeedback(null)).toThrow()
    expect(validateFeedback(good).verdict).toBe('incorrect')
  })

  it('keeps the reference material out of nothing but the tutor-only section', () => {
    const message = buildUserMessage(wrongAlias())
    expect(message).toContain('For your eyes only')
    expect(message).toContain('attempt 1')
  })
})

describe('spend tracking', () => {
  it('estimates cost from token counts and treats unknown models as expensive', () => {
    expect(estimateCost('claude-opus-5-5', 1_000_000, 1_000_000)).toBe(24)
    expect(estimateCost('claude-haiku-5-5', 1_000_000, 0)).toBeCloseTo(0.1)
    expect(estimateCost('some-future-model', 1_000_000, 0)).toBe(8)
  })

  it('adds usage per day and per session, and resets on a new day', async () => {
    const db = new LabDB('tutor-usage')
    const sessionId = await db.sessions.add({ kind: 'learn', startedAt: 0, exerciseIds: [] })
    const monday = new Date(2026, 10, 9, 10)
    await addUsage({ inputTokens: 1000, outputTokens: 200, costUsd: 0.008 }, sessionId, db, monday)
    const today = await addUsage({ inputTokens: 500, outputTokens: 100, costUsd: 0.004 }, sessionId, db, monday)
    expect(today).toMatchObject({ day: '2026-11-09', requests: 2, inputTokens: 1500, outputTokens: 300 })
    expect(today.costUsd).toBeCloseTo(0.012)
    expect((await db.sessions.get(sessionId))!.usage!.inputTokens).toBe(1500)
    expect(await getDailyUsage(db, new Date(2026, 10, 10, 9))).toMatchObject({ day: '2026-11-10', requests: 0, costUsd: 0 })
  })

  it('reports usage for every request and stops at the daily limit', async () => {
    const seen: number[] = []
    const client = fakeClient(good)
    await anthropicTutor({ client, model: 'claude-opus-5-5', onUsage: (u) => { seen.push(u.costUsd) } }).feedback(wrongAlias())
    expect(seen).toEqual([estimateCost('claude-opus-5-5', 1000, 200)])
    expect(overLimit({ ...DEFAULT_CONFIG, dailyLimitUsd: 0.5 }, { day: dayOf(new Date()), requests: 9, inputTokens: 0, outputTokens: 0, costUsd: 0.5 })).toBe(true)
    expect(overLimit({ ...DEFAULT_CONFIG, dailyLimitUsd: 0.5 }, { day: dayOf(new Date()), requests: 9, inputTokens: 0, outputTokens: 0, costUsd: 0.49 })).toBe(false)
  })
})

describe('generated variants', () => {
  let py: PyodideLike
  beforeAll(async () => {
    py = await testPyodide()
  })
  const run = async (request: Parameters<typeof runWithPyodide>[1]) => runWithPyodide(py, request)

  it('takes the expected output from running the code, not from the model', async () => {
    const draft = { title: 'Two names for one reading list', code: 'x = [5]\ny = x\ny.append(6)\nprint(x)\n', hints: ['How many lists are there?'], explanation: 'y is another name for the same list.' }
    const { exercise } = await generateVariant(ex('alias-predict'), fakeClient(draft), 'claude-opus-5-5', run, 42)
    expect(exercise).toMatchObject({ id: 'gen-alias-predict-42', source: 'generated', expectedOutput: '[5, 6]', topicIds: ['d-identity'], misconception: 'list-identity' })
  })

  it('discards a variant that does not run or prints nothing', async () => {
    const broken = { title: 't', code: 'print(undefined_name)\n', hints: ['h'], explanation: 'e' }
    await expect(generateVariant(ex('alias-predict'), fakeClient(broken), 'm', run)).rejects.toThrow('did not run (NameError)')
    const silent = { title: 't', code: 'x = 1\n', hints: ['h'], explanation: 'e' }
    await expect(generateVariant(ex('alias-predict'), fakeClient(silent), 'm', run)).rejects.toThrow('printed nothing')
  })
})
