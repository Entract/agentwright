import { CONTENT_VERSION, seedExercises, topics } from '../content'
import type { Attempt, Exercise, ReviewCard, Session, Setting, Topic } from '../types'
import { db as defaultDb, type LabDB } from './db'

export const BACKUP_FORMAT = 'python-learning-lab-backup'
export const BACKUP_VERSION = 1

/** Settings that must never leave the device. API keys are not kept in this table at all; this is a second guard. */
const PRIVATE_SETTING = /key|secret|token/i

export interface Backup {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  exportedAt: string
  contentVersion: number
  attempts: Attempt[]
  cards: ReviewCard[]
  sessions: Session[]
  settings: Setting[]
  /** Exercises added by the learner, an import or the AI tutor. */
  exercises: Exercise[]
  /** Exercise versions the learner actually attempted. */
  snapshots: Exercise[]
  /** The built-in course at the time of export, for reading outside the app. Not re-imported. */
  lessons: { topics: Topic[]; exercises: Exercise[] }
}

/** Everything needed to restore progress on another device, as plain JSON. */
export async function exportBackup(db: LabDB = defaultDb, now = new Date()): Promise<Backup> {
  const [attempts, cards, sessions, settings, exercises, snapshots] = await Promise.all([
    db.attempts.toArray(),
    db.cards.toArray(),
    db.sessions.toArray(),
    db.settings.toArray(),
    db.exercises.toArray(),
    db.snapshots.toArray(),
  ])
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    contentVersion: CONTENT_VERSION,
    attempts,
    cards,
    sessions,
    settings: settings.filter((s) => !PRIVATE_SETTING.test(s.key)),
    exercises,
    snapshots,
    lessons: { topics, exercises: seedExercises },
  }
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const b = data as Partial<Backup>
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('That file is not a Python Learning Lab backup.')
  if (typeof b.formatVersion !== 'number' || b.formatVersion > BACKUP_VERSION) {
    throw new Error('That backup was made by a newer version of the app.')
  }
  for (const key of ['attempts', 'cards', 'sessions', 'settings'] as const) {
    if (!Array.isArray(b[key])) throw new Error(`The backup is missing its ${key}.`)
  }
  return { ...(b as Backup), exercises: b.exercises ?? [], snapshots: b.snapshots ?? [] }
}

export interface ImportResult {
  attempts: number
  cards: number
  sessions: number
}

/** Replaces everything in the database with the backup. All or nothing. */
export async function importBackup(backup: Backup, db: LabDB = defaultDb): Promise<ImportResult> {
  await db.transaction('rw', [db.attempts, db.cards, db.sessions, db.settings, db.exercises, db.snapshots], async () => {
    await Promise.all([db.attempts.clear(), db.cards.clear(), db.sessions.clear(), db.settings.clear(), db.exercises.clear(), db.snapshots.clear()])
    await db.attempts.bulkAdd(backup.attempts)
    await db.cards.bulkAdd(backup.cards)
    await db.sessions.bulkAdd(backup.sessions)
    await db.settings.bulkAdd(backup.settings.filter((s) => !PRIVATE_SETTING.test(s.key)))
    await db.exercises.bulkAdd(backup.exercises)
    await db.snapshots.bulkAdd(backup.snapshots)
  })
  return { attempts: backup.attempts.length, cards: backup.cards.length, sessions: backup.sessions.length }
}

/** Removes all progress. Review cards are seeded again on the next start. */
export async function resetAll(db: LabDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.attempts, db.cards, db.sessions, db.settings, db.exercises, db.snapshots], async () => {
    await Promise.all([db.attempts.clear(), db.cards.clear(), db.sessions.clear(), db.settings.clear(), db.exercises.clear(), db.snapshots.clear()])
  })
}
