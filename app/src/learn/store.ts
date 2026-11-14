import { db as defaultDb, getSetting, setSetting, type LabDB } from '../db/db'
import { CONTENT_VERSION, misconceptionById, seedCards, seedExercises } from '../content'
import { resetForPractice } from '../review/scheduler'
import type { Attempt, Exercise, ReviewCard, Session } from '../types'

/** Adds seed review cards that are not in the database yet. Safe to call on every start. */
export async function ensureSeeded(db: LabDB = defaultDb, now = Date.now()): Promise<void> {
  // One transaction, so two callers at start-up cannot both insert the cards.
  await db.transaction('rw', db.cards, db.settings, async () => {
    const seeded = await getSetting<number>('seedVersion', 0, db)
    if (seeded >= CONTENT_VERSION) return
    const existing = new Set(await db.cards.toCollection().primaryKeys())
    const fresh = seedCards(now).filter((c) => !existing.has(c.id))
    if (fresh.length) await db.cards.bulkAdd(fresh)
    await setSetting('seedVersion', CONTENT_VERSION, db)
  })
}

/** Seed exercises plus any imported or generated ones; a stored exercise replaces a seed one with the same id. */
export async function allExercises(db: LabDB = defaultDb): Promise<Exercise[]> {
  const stored = await db.exercises.toArray()
  const byId = new Map(seedExercises.map((e) => [e.id, e]))
  for (const e of stored) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => a.order - b.order)
}

/** Stores an attempt, and the exercise as it was shown, so the attempt can still be read after the exercise changes. */
export async function recordAttempt(attempt: Omit<Attempt, 'id'>, db: LabDB = defaultDb, exercise?: Exercise): Promise<number> {
  if (exercise && !(await db.snapshots.get([exercise.id, exercise.version]))) await db.snapshots.put(exercise)
  return db.attempts.add(attempt as Attempt)
}

/**
 * Learner correction of a grade. Neither kind changes the recorded outcome;
 * both mark the reasoning as sound so the concept is not treated as shaky.
 */
export async function regradeAttempt(id: number, kind: 'typo' | 'misread', db: LabDB = defaultDb): Promise<void> {
  await db.attempts.update(id, { regrade: kind, reasoning: 'sound', errorClass: kind })
}

/** True when an attempt is evidence of a shaky concept rather than a slip. */
export function isConceptMiss(a: Attempt): boolean {
  if (a.verdict === 'correct' || a.regrade) return false
  return a.errorClass === 'concept' || a.errorClass === 'logic'
}

/**
 * After an exercise, brings the matching review card forward if the concept was
 * missed. Exercises without a seeded card get a practice card of their own.
 * Returns the card that was added or brought forward, if any.
 */
export async function scheduleReviewFor(
  exercise: Exercise,
  attempts: Attempt[],
  db: LabDB = defaultDb,
  now = Date.now(),
): Promise<ReviewCard | null> {
  if (!attempts.some(isConceptMiss)) return null
  const seededId = exercise.misconception ? `card-${exercise.misconception}` : null
  const existing = (seededId && (await db.cards.get(seededId))) || (await db.cards.get(`practice-${exercise.id}`))
  if (existing) {
    if (existing.retired) return null
    const updated = resetForPractice(existing, now)
    await db.cards.put(updated)
    return updated
  }
  const misconception = exercise.misconception ? misconceptionById.get(exercise.misconception) : undefined
  const card: ReviewCard = {
    id: `practice-${exercise.id}`,
    topicId: exercise.topicIds[0],
    kind: 'recall',
    front: misconception?.card.front ?? `${exercise.title}: what was the key idea?`,
    back: misconception?.card.back ?? exercise.explanation,
    misconception: exercise.misconception,
    source: 'practice',
    dueAt: now,
    intervalDays: 0,
    step: 0,
    history: [],
    retired: false,
  }
  await db.cards.add(card)
  return card
}

export interface ActiveSession {
  id: number
  exerciseIds: string[]
  index: number
  /** Review cards added or brought forward during this session. */
  cardIds: string[]
}

export async function startSession(kind: Session['kind'], exerciseIds: string[], db: LabDB = defaultDb, now = Date.now()): Promise<ActiveSession> {
  const id = await db.sessions.add({ kind, startedAt: now, exerciseIds })
  const active: ActiveSession = { id, exerciseIds, index: 0, cardIds: [] }
  await setSetting('activeSession', active, db)
  return active
}

export async function getActiveSession(db: LabDB = defaultDb): Promise<ActiveSession | null> {
  return getSetting<ActiveSession | null>('activeSession', null, db)
}

export async function saveActiveSession(active: ActiveSession, db: LabDB = defaultDb): Promise<void> {
  await setSetting('activeSession', active, db)
}

export async function endSession(id: number, db: LabDB = defaultDb, now = Date.now()): Promise<void> {
  const active = await getActiveSession(db)
  await db.sessions.update(id, { endedAt: now, ...(active?.id === id ? { cardIds: active.cardIds } : {}) })
  await setSetting('activeSession', null, db)
}
