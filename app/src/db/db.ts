import Dexie, { type Table } from 'dexie'
import type { Attempt, Exercise, ReviewCard, Session, Setting } from '../types'

/**
 * Local store. Topics and seed exercises ship in the app bundle (src/content);
 * the `exercises` table holds only learner-added, imported or generated ones.
 * Mastery is derived from attempts and card history rather than stored.
 */
export class LabDB extends Dexie {
  attempts!: Table<Attempt, number>
  cards!: Table<ReviewCard, string>
  sessions!: Table<Session, number>
  settings!: Table<Setting, string>
  exercises!: Table<Exercise, string>
  /** Each exercise version the learner has attempted, so old attempts stay interpretable after content changes. */
  snapshots!: Table<Exercise, [string, number]>

  constructor(name = 'python-learning-lab') {
    super(name)
    this.version(1).stores({
      attempts: '++id, exerciseId, sessionId, ts',
      cards: 'id, topicId, dueAt',
      sessions: '++id, startedAt',
      settings: 'key',
      exercises: 'id',
    })
    this.version(2).stores({ snapshots: '[id+version]' })
  }
}

export const db = new LabDB()

export async function getSetting<T>(key: string, fallback: T, database: LabDB = db): Promise<T> {
  const row = await database.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown, database: LabDB = db): Promise<void> {
  await database.settings.put({ key, value })
}
