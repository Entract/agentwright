import type { Attempt, Exercise, ReviewCard, Topic } from '../types'
import { retainedReviews } from '../review/scheduler'

/** The six evidence states from the brief. They are separate kinds of evidence, not a ladder of scores. */
export const STATES = [
  { key: 'introduced', label: 'Introduced' },
  { key: 'explain', label: 'Can explain' },
  { key: 'predict', label: 'Can predict' },
  { key: 'writeHelped', label: 'Can write with help' },
  { key: 'writeIndependent', label: 'Can write independently' },
  { key: 'retained', label: 'Retained after review' },
] as const

export type StateKey = (typeof STATES)[number]['key']

export interface TopicEvidence {
  topicId: string
  /** Number of distinct pieces of evidence for each state (distinct exercises, or spaced reviews). */
  counts: Record<StateKey, number>
  attempts: number
  /** Wrong answers that point at the concept. */
  conceptMisses: number
  /** Typing and syntax slips, kept apart from concept misses. */
  slips: number
  lastEvidence: number | null
}

const INITIAL_NOTE: Record<Topic['initialStatus'], string> = {
  practised: 'Practised in the original conversation. No evidence recorded here yet.',
  review: 'Flagged for review from the original conversation. No evidence recorded here yet.',
  untested: 'Not yet tested independently.',
  later: 'Planned for later.',
}

export function initialNote(topic: Topic): string {
  return INITIAL_NOTE[topic.initialStatus]
}

/** Words for how much evidence there is. Deliberately not a percentage. */
export function evidenceStrength(count: number): string {
  if (count === 0) return 'no evidence yet'
  if (count < 3) return 'limited evidence'
  return 'repeated evidence'
}

/** Derives per-topic evidence from the attempt log and review history. Nothing here is stored. */
export function topicEvidence(topics: Topic[], exercises: Exercise[], attempts: Attempt[], cards: ReviewCard[]): Map<string, TopicEvidence> {
  const byExercise = new Map(exercises.map((e) => [e.id, e]))
  const sets = new Map<string, Record<Exclude<StateKey, 'introduced' | 'retained'>, Set<string>>>()
  const out = new Map<string, TopicEvidence>()
  for (const topic of topics) {
    sets.set(topic.id, { explain: new Set(), predict: new Set(), writeHelped: new Set(), writeIndependent: new Set() })
    out.set(topic.id, {
      topicId: topic.id,
      counts: {
        introduced: topic.initialStatus === 'practised' || topic.initialStatus === 'review' ? 1 : 0,
        explain: 0, predict: 0, writeHelped: 0, writeIndependent: 0, retained: 0,
      },
      attempts: 0, conceptMisses: 0, slips: 0, lastEvidence: null,
    })
  }

  for (const a of attempts) {
    const exercise = byExercise.get(a.exerciseId)
    if (!exercise) continue
    for (const topicId of exercise.topicIds) {
      const ev = out.get(topicId)
      const set = sets.get(topicId)
      if (!ev || !set) continue
      ev.attempts++
      ev.counts.introduced = Math.max(ev.counts.introduced, 1)
      ev.lastEvidence = Math.max(ev.lastEvidence ?? 0, a.ts)
      if (a.errorClass === 'typo' || a.errorClass === 'syntax') ev.slips++
      if (a.verdict !== 'correct') {
        if (!a.regrade && (a.errorClass === 'concept' || a.errorClass === 'logic')) ev.conceptMisses++
        continue
      }
      // A correct answer given after the solution was revealed is not evidence of anything.
      if (a.revealed) continue
      if (exercise.answer === 'code') {
        if (a.independent) set.writeIndependent.add(exercise.id)
        else set.writeHelped.add(exercise.id)
      } else if (exercise.mode === 'explain') set.explain.add(exercise.id)
      else set.predict.add(exercise.id)
    }
  }

  for (const [topicId, set] of sets) {
    const ev = out.get(topicId)!
    for (const id of set.writeIndependent) set.writeHelped.delete(id)
    ev.counts.explain = set.explain.size
    ev.counts.predict = set.predict.size
    ev.counts.writeHelped = set.writeHelped.size
    ev.counts.writeIndependent = set.writeIndependent.size
  }

  for (const card of cards) {
    const ev = out.get(card.topicId)
    if (!ev) continue
    ev.counts.retained += retainedReviews(card)
    const last = card.history[card.history.length - 1]
    if (last) ev.lastEvidence = Math.max(ev.lastEvidence ?? 0, last.ts)
  }
  return out
}

export interface ActivitySummary {
  attemptsThisWeek: number
  minutesThisWeek: number
  minutesTotal: number
  conceptMisses: number
  slips: number
}

const WEEK = 7 * 24 * 60 * 60 * 1000
/** A session left open is counted for at most this long. */
const SESSION_CAP_MIN = 45

export function activitySummary(
  attempts: Attempt[],
  sessions: { startedAt: number; endedAt?: number }[],
  now: number,
): ActivitySummary {
  const minutes = (s: { startedAt: number; endedAt?: number }) =>
    s.endedAt ? Math.min(SESSION_CAP_MIN, Math.max(0, (s.endedAt - s.startedAt) / 60000)) : 0
  const recent = (ts: number) => now - ts < WEEK
  return {
    attemptsThisWeek: attempts.filter((a) => recent(a.ts)).length,
    minutesThisWeek: Math.round(sessions.filter((s) => recent(s.startedAt)).reduce((sum, s) => sum + minutes(s), 0)),
    minutesTotal: Math.round(sessions.reduce((sum, s) => sum + minutes(s), 0)),
    conceptMisses: attempts.filter((a) => a.verdict !== 'correct' && !a.regrade && (a.errorClass === 'concept' || a.errorClass === 'logic')).length,
    slips: attempts.filter((a) => a.errorClass === 'typo' || a.errorClass === 'syntax').length,
  }
}
