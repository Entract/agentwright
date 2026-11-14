import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { seedExerciseById } from '../content'
import { estimateCost, type TutorClient } from './anthropic'
import { askTutor, buildChatMessages, CHAT_SYSTEM_PROMPT, MAX_TURNS_SENT, WITHHELD_TEXT } from './chat'

const ex = (id: string) => seedExerciseById.get(id)!

type Body = Anthropic.Beta.MessageCreateParamsNonStreaming

function textClient(text: string, over: Partial<Anthropic.Beta.BetaMessage> = {}): TutorClient & { calls: Body[] } {
  const calls: Body[] = []
  return {
    calls,
    async create(body) {
      calls.push(body)
      return {
        id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn',
        content: [{ type: 'text', text, citations: null }],
        usage: { input_tokens: 1000, output_tokens: 200 },
        ...over,
      } as unknown as Anthropic.Beta.BetaMessage
    },
  }
}

describe('asking the tutor questions', () => {
  it('sends fresh exercise context with every question and says whether the solution has been seen', () => {
    const exercise = ex('alias-predict')
    const hidden = buildChatMessages({ exercise, answer: '[1, 2]', lastCheck: 'Not yet.', solutionSeen: false }, [], 'why is it not [1, 2]?')
    expect(hidden).toHaveLength(1)
    const first = String(hidden[0].content)
    expect(first).toContain('The solution has NOT been seen')
    expect(first).toContain('What the learner has typed so far:\n[1, 2]')
    expect(first).toContain('Most recent check: Not yet.')
    expect(first).toContain('why is it not [1, 2]?')
    expect(String(buildChatMessages({ exercise, solutionSeen: true }, [], 'q')[0].content)).toContain('The solution HAS been seen')
    expect(String(buildChatMessages({ solutionSeen: true }, [], 'what is a tuple?')[0].content)).toContain('a general question')
  })

  it('sends only the most recent turns, starting with the learner and alternating', () => {
    const history = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 === 0 ? ('user' as const) : ('assistant' as const), text: `turn ${i}` }))
    const messages = buildChatMessages({ solutionSeen: true }, history, 'latest')
    expect(messages.length).toBeLessThanOrEqual(MAX_TURNS_SENT + 1)
    expect(messages[0].role).toBe('user')
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'latest' })
    for (let i = 1; i < messages.length - 1; i++) expect(messages[i].role).not.toBe(messages[i - 1].role)
  })

  it('returns the reply and its cost, as plain text rather than structured output', async () => {
    const client = textClient('b = a gives the same list a second name.')
    const reply = await askTutor(client, 'claude-opus-5-5', { solutionSeen: true }, [], 'why does b = a not copy?')
    expect(reply).toMatchObject({ text: 'b = a gives the same list a second name.', withheld: false })
    expect(reply.usage.costUsd).toBe(estimateCost('claude-opus-5-5', 1000, 200))
    expect(client.calls[0].system).toBe(CHAT_SYSTEM_PROMPT)
    expect(client.calls[0].output_config?.format).toBeUndefined()
  })

  it('withholds a reply that gives the answer before the solution has been seen', async () => {
    const exercise = ex('alias-predict')
    const leaking = 'It prints [1, 2, 3] then True False then False.'
    const before = await askTutor(textClient(leaking), 'm', { exercise, solutionSeen: false }, [], 'just tell me')
    expect(before).toMatchObject({ withheld: true, text: WITHHELD_TEXT })
    const after = await askTutor(textClient(leaking), 'm', { exercise, solutionSeen: true }, [], 'explain the answer')
    expect(after).toMatchObject({ withheld: false, text: leaking })
  })

  it('withholds leaked solution code on a writing exercise', async () => {
    const exercise = ex('count-high-write')
    const leaking = 'Finish with:\n    print(count_high(measurements))'
    expect((await askTutor(textClient(leaking), 'm', { exercise, solutionSeen: false }, [], 'what goes last?')).withheld).toBe(true)
    const fine = 'Think about where the counter starts, and what the loop gives you each time round.'
    expect((await askTutor(textClient(fine), 'm', { exercise, solutionSeen: false }, [], 'how do I start?')).withheld).toBe(false)
  })

  it('reports a refusal or an empty reply as an error that still carries the usage', async () => {
    await expect(askTutor(textClient('x', { stop_reason: 'refusal' }), 'm', { solutionSeen: true }, [], 'q')).rejects.toMatchObject({
      message: 'The tutor declined to answer that.',
      usage: { inputTokens: 1000 },
    })
    await expect(askTutor(textClient('   '), 'm', { solutionSeen: true }, [], 'q')).rejects.toThrow('empty reply')
  })
})
