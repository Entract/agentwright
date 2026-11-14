import type { ReviewCard } from '../types'

export const DAY = 24 * 60 * 60 * 1000
/** Fixed first steps in days: due today, tomorrow, 3 days, 7 days. After that the interval adapts. */
export const STEPS = [0, 1, 3, 7]
const MAX_INTERVAL = 120
const AGAIN_DELAY = 10 * 60 * 1000

export type Rating = 'again' | 'hard' | 'good'

/** Interval in days that a rating would lead to. */
export function nextInterval(card: Pick<ReviewCard, 'step' | 'intervalDays'>, rating: Rating): { step: number; intervalDays: number } {
  if (rating === 'again') return { step: 0, intervalDays: 0 }
  if (rating === 'hard') return { step: card.step, intervalDays: Math.max(1, card.intervalDays) }
  const step = card.step + 1
  if (step < STEPS.length) return { step, intervalDays: STEPS[step] }
  return { step, intervalDays: Math.min(MAX_INTERVAL, Math.max(STEPS[STEPS.length - 1] * 2, Math.round(card.intervalDays * 2))) }
}

/** Applies one review. "Again" brings the card back in ten minutes and restarts the steps. */
export function applyReview(card: ReviewCard, rating: Rating, now: number, note?: string): ReviewCard {
  const { step, intervalDays } = nextInterval(card, rating)
  return {
    ...card,
    step,
    intervalDays,
    dueAt: rating === 'again' ? now + AGAIN_DELAY : now + intervalDays * DAY,
    history: [...card.history, { ts: now, rating, intervalDays, ...(note ? { note } : {}) }],
  }
}

/** Makes a card due now because the concept was missed in practice. */
export function resetForPractice(card: ReviewCard, now: number): ReviewCard {
  return { ...card, step: 0, intervalDays: 0, dueAt: now }
}

/** Due cards, weak areas first, then the longest overdue. */
export function dueCards(cards: ReviewCard[], now: number, priority: string[] = []): ReviewCard[] {
  const rank = (c: ReviewCard) => (c.misconception && priority.includes(c.misconception) ? 0 : 1)
  return cards
    .filter((c) => !c.retired && c.dueAt <= now)
    .sort((a, b) => rank(a) - rank(b) || a.dueAt - b.dueAt || a.id.localeCompare(b.id))
}

export function describeInterval(intervalDays: number): string {
  if (intervalDays === 0) return 'in 10 minutes'
  if (intervalDays === 1) return 'tomorrow'
  return `in ${intervalDays} days`
}

/** A success after a gap of three days or more counts as "retained after review". */
export function retainedReviews(card: ReviewCard): number {
  let count = 0
  for (let i = 1; i < card.history.length; i++) {
    const gapDays = (card.history[i].ts - card.history[i - 1].ts) / DAY
    if (card.history[i].rating !== 'again' && gapDays >= 2.5) count++
  }
  return count
}
