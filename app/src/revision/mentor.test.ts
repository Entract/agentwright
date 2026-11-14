import { describe, expect, it } from 'vitest'
import { parseSet, type Question } from './format'
import { LEVELS, MENTOR_SYSTEM, conversation, exerciseText, mentorMessage, readVerdict, replyParts, type Turn } from './mentorText'

type Write = Extract<Question, { type: 'write' }>
const agent = parseSet(
  JSON.stringify({
    questions: [{ type: 'write', question: 'Handle every tool request.', starter: 'import anthropic\n', criteria: ['Each tool_use gets one tool_result'], prompts: ['Read it twice'], solution: 'SECRET_ANSWER = 1' }],
  }),
).questions[0] as Write

describe('what the mentor is sent', () => {
  it('carries the level, the exercise, the code, the output and the highlighted code', () => {
    const sent = mentorMessage(agent, 'hint', 'Why does it stop?', { code: 'x = 1', output: 'Traceback: KeyError', selection: 'x = 1' })
    expect(sent).toContain('Level of help: HINT')
    expect(sent).toContain('Handle every tool request.')
    expect(sent).toContain('- Each tool_use gets one tool_result')
    expect(sent).toContain('<their_code_now>\nx = 1\n</their_code_now>')
    expect(sent).toContain('Traceback: KeyError')
    expect(sent).toContain('<highlighted_code>')
    expect(sent).toContain('Why does it stop?')
  })

  it('says so when nothing has been run, and uses the stock question when nothing was typed', () => {
    const sent = mentorMessage(agent, 'judge', '  ', { code: '', output: '', selection: '' })
    expect(sent).toContain('(nothing has been run yet)')
    expect(sent).toContain('(the editor is empty)')
    expect(sent).toContain(LEVELS.find((l) => l.id === 'judge')!.ask)
    expect(sent).not.toContain('<highlighted_code>')
  })

  it('keeps the end of a long output, where the error is', () => {
    const sent = mentorMessage(agent, 'explain', '', { code: 'x', output: 'a'.repeat(9000) + 'THE_ERROR', selection: '' })
    expect(sent).toContain('THE_ERROR')
    expect(sent).toContain('[earlier part left out]')
  })

  it('marks the reference solution as not for the learner, and leaves it out when there is none', () => {
    expect(exerciseText(agent)).toContain('<reference_solution_not_for_the_learner>\nSECRET_ANSWER = 1')
    const bare = parseSet(JSON.stringify({ questions: [{ type: 'write', question: 'Q', acceptance_criteria: ['It works'] }] })).questions[0] as Write
    expect(bare.solution).toBe('')
    expect(exerciseText(bare)).not.toContain('reference_solution')
  })

  it('tells the mentor the limits of each level and never to edit the code', () => {
    for (const word of ['HINT', 'EXPLAIN', 'REVIEW', 'JUDGE', 'SOLUTION']) expect(MENTOR_SYSTEM).toContain(`- ${word}:`)
    expect(MENTOR_SYSTEM).toContain('You cannot change their code')
    expect(LEVELS[0].id).toBe('hint')
  })
})

describe('the conversation', () => {
  it('sends what was attached, not just what is shown, and starts on a learner turn', () => {
    const turns: Turn[] = [
      { role: 'assistant', text: 'stray' },
      { role: 'user', text: 'Why?', sent: 'FULL MESSAGE' },
      { role: 'assistant', text: 'Because.' },
    ]
    expect(conversation(turns)).toEqual([
      { role: 'user', content: 'FULL MESSAGE' },
      { role: 'assistant', content: 'Because.' },
    ])
  })

  it('keeps only the newest turns', () => {
    const turns: Turn[] = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `t${i}` }) as Turn)
    const sent = conversation(turns)
    expect(sent.length).toBeLessThanOrEqual(12)
    expect(sent[0].role).toBe('user')
    expect(sent[sent.length - 1].content).toBe('t29')
  })
})

describe('reading a reply', () => {
  it('finds the verdict line at the end only', () => {
    expect(readVerdict('1. Met\n2. Met\n\nVERDICT: DONE')).toBe('done')
    expect(readVerdict('…\nVERDICT: NOT YET\n')).toBe('not yet')
    expect(readVerdict('…\nverdict: test more')).toBe('test more')
    expect(readVerdict('VERDICT: DONE is what you want, but not yet.')).toBeNull()
    expect(readVerdict('No verdict here.')).toBeNull()
  })

  it('separates prose from fenced code', () => {
    expect(replyParts('Look here:\n```python\nx = 1\n```\nThen run it.')).toEqual([
      { code: false, text: 'Look here:' },
      { code: true, text: 'x = 1' },
      { code: false, text: 'Then run it.' },
    ])
  })
})

describe('readMarks', () => {
  it('reads plain and bold numbered lines', async () => {
    const { readMarks } = await import('./mentorText')
    const reply = '**1. Real SDK: Met.** You import it.\n\n2. Not met: the key is units.\n\n**3. A real request: Not shown.** Run it.\n\nVERDICT: NOT YET'
    expect(readMarks(reply, 4)).toEqual(['met', 'not met', 'not shown', null])
  })
})
