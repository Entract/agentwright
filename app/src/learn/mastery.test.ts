import { describe, expect, it } from 'vitest'
import { seedExercises, topics } from '../content'
import { activitySummary, evidenceStrength, topicEvidence } from './mastery'
import { DAY } from '../review/scheduler'
import type { Attempt, ReviewCard } from '../types'

let nextId = 1
const attempt = (exerciseId: string, over: Partial<Attempt> = {}): Attempt => ({
  id: nextId++, exerciseId, exerciseVersion: 1, ts: 1000, mode: 'predict', submitted: '',
  verdict: 'correct', reasoning: 'sound', errorClass: 'none', hintsUsed: 0, revealed: false, independent: false, ...over,
})

const evidence = (attempts: Attempt[], cards: ReviewCard[] = []) => topicEvidence(topics, seedExercises, attempts, cards)

describe('mastery evidence', () => {
  it('keeps "can predict" apart from "can write independently"', () => {
    const ev = evidence([attempt('print-vs-return-predict'), attempt('early-return-predict')]).get('c-return')!
    expect(ev.counts.predict).toBe(2)
    expect(ev.counts.writeIndependent).toBe(0)
    expect(ev.counts.writeHelped).toBe(0)
  })

  it('separates independent writing from writing with help', () => {
    const helped = evidence([attempt('count-high-write', { mode: 'write', hintsUsed: 1 })]).get('g-write-function')!
    expect(helped.counts).toMatchObject({ writeHelped: 1, writeIndependent: 0 })
    const alone = evidence([
      attempt('count-high-write', { mode: 'write', hintsUsed: 1 }),
      attempt('count-high-write', { mode: 'write', independent: true }),
    ]).get('g-write-function')!
    expect(alone.counts).toMatchObject({ writeHelped: 0, writeIndependent: 1 })
  })

  it('counts distinct exercises, so repeating one does not inflate the evidence', () => {
    const ev = evidence([attempt('alias-predict'), attempt('alias-predict'), attempt('alias-predict')]).get('d-identity')!
    expect(ev.counts.predict).toBe(1)
    expect(ev.attempts).toBe(3)
  })

  it('does not count a syntax slip or a regraded typo as a concept miss', () => {
    const ev = evidence([
      attempt('count-high-write', { verdict: 'incorrect', errorClass: 'syntax', reasoning: 'unknown' }),
      attempt('alias-predict', { verdict: 'incorrect', errorClass: 'typo', regrade: 'typo' }),
      attempt('alias-predict', { verdict: 'incorrect', errorClass: 'concept', reasoning: 'unsound' }),
    ])
    expect(ev.get('g-write-function')).toMatchObject({ conceptMisses: 0, slips: 1 })
    expect(ev.get('d-identity')).toMatchObject({ conceptMisses: 1, slips: 1 })
  })

  it('ignores a correct answer given after the solution was revealed', () => {
    const ev = evidence([attempt('alias-predict', { revealed: true })]).get('d-identity')!
    expect(ev.counts.predict).toBe(0)
  })

  it('starts from the seeded position and records "retained" only after a spaced review', () => {
    const base = evidence([])
    expect(base.get('b-for')!.counts.introduced).toBe(1)
    expect(base.get('g-write-function')!.counts.introduced).toBe(0)
    const card: ReviewCard = {
      id: 'card-list-identity', topicId: 'd-identity', kind: 'recall', front: '', back: '', source: 'conversation',
      dueAt: 0, intervalDays: 7, step: 3, retired: false,
      history: [
        { ts: 0, rating: 'good', intervalDays: 1 },
        { ts: 1 * DAY, rating: 'good', intervalDays: 3 },
        { ts: 4 * DAY, rating: 'good', intervalDays: 7 },
      ],
    }
    expect(evidence([], [card]).get('d-identity')!.counts.retained).toBe(1)
  })

  it('describes evidence in words rather than percentages', () => {
    expect([0, 1, 3].map(evidenceStrength)).toEqual(['no evidence yet', 'limited evidence', 'repeated evidence'])
  })

  it('sums practice minutes from sessions and caps a session left open', () => {
    const now = 10 * DAY
    const summary = activitySummary(
      [attempt('alias-predict', { ts: now - 1000 }), attempt('alias-predict', { ts: 0 })],
      [
        { startedAt: now - 20 * 60000, endedAt: now - 10 * 60000 },
        { startedAt: now - 5 * 3600000, endedAt: now },
        { startedAt: 0, endedAt: 6 * 60000 },
        { startedAt: now - 1000 },
      ],
      now,
    )
    expect(summary).toMatchObject({ attemptsThisWeek: 1, minutesThisWeek: 55, minutesTotal: 61 })
  })
})
