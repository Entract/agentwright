import { describe, expect, it } from 'vitest'
import { applyReview, DAY, describeInterval, dueCards, nextInterval, resetForPractice, retainedReviews } from './scheduler'
import type { ReviewCard } from '../types'

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
  id: 'c1', topicId: 'd-identity', kind: 'recall', front: 'q', back: 'a', source: 'conversation',
  dueAt: 0, intervalDays: 0, step: 0, history: [], retired: false, ...over,
})

describe('scheduler', () => {
  it('walks the fixed steps: today, tomorrow, 3 days, 7 days', () => {
    let c = card()
    const intervals: number[] = []
    let now = 0
    for (let i = 0; i < 3; i++) {
      c = applyReview(c, 'good', now)
      intervals.push(c.intervalDays)
      expect(c.dueAt).toBe(now + c.intervalDays * DAY)
      now = c.dueAt
    }
    expect(intervals).toEqual([1, 3, 7])
  })

  it('adapts after the fixed steps and caps the interval', () => {
    let c = card({ step: 3, intervalDays: 7 })
    c = applyReview(c, 'good', 0)
    expect(c.intervalDays).toBe(14)
    c = applyReview(c, 'good', 0)
    expect(c.intervalDays).toBe(28)
    expect(nextInterval({ step: 9, intervalDays: 100 }, 'good').intervalDays).toBe(120)
  })

  it('repeats the interval on "shaky" and restarts on "missed"', () => {
    const c = card({ step: 3, intervalDays: 7 })
    expect(applyReview(c, 'hard', 0)).toMatchObject({ step: 3, intervalDays: 7, dueAt: 7 * DAY })
    const missed = applyReview(c, 'again', 1000)
    expect(missed).toMatchObject({ step: 0, intervalDays: 0, dueAt: 1000 + 10 * 60 * 1000 })
    expect(applyReview(missed, 'good', 2000).intervalDays).toBe(1)
  })

  it('records every review with its note', () => {
    const c = applyReview(card(), 'good', 5, 'two names, one list')
    expect(c.history).toEqual([{ ts: 5, rating: 'good', intervalDays: 1, note: 'two names, one list' }])
  })

  it('lists due cards with weak areas first and skips retired ones', () => {
    const cards = [
      card({ id: 'late', dueAt: 10 }),
      card({ id: 'weak', dueAt: 50, misconception: 'list-identity' }),
      card({ id: 'future', dueAt: 500 }),
      card({ id: 'retired', dueAt: 1, retired: true }),
      card({ id: 'early', dueAt: 5 }),
    ]
    expect(dueCards(cards, 100, ['list-identity']).map((c) => c.id)).toEqual(['weak', 'early', 'late'])
  })

  it('makes a card due immediately after a miss in practice', () => {
    expect(resetForPractice(card({ step: 4, intervalDays: 14, dueAt: 99 * DAY }), 7)).toMatchObject({ step: 0, intervalDays: 0, dueAt: 7 })
  })

  it('counts a success after a gap of days as retained, but not same-day repeats', () => {
    const history = [
      { ts: 0, rating: 'good' as const, intervalDays: 1 },
      { ts: 1000, rating: 'good' as const, intervalDays: 3 },
      { ts: 3 * DAY, rating: 'good' as const, intervalDays: 7 },
      { ts: 10 * DAY, rating: 'again' as const, intervalDays: 0 },
    ]
    expect(retainedReviews(card({ history }))).toBe(1)
  })

  it('describes intervals in plain words', () => {
    expect([0, 1, 3].map(describeInterval)).toEqual(['in 10 minutes', 'tomorrow', 'in 3 days'])
  })
})
