import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { seedExerciseById } from '../content'
import { ensureSeeded, recordAttempt, regradeAttempt, startSession } from '../learn/store'
import { applyReview } from '../review/scheduler'
import { exportBackup, importBackup, parseBackup, resetAll } from './backup'
import { LabDB, setSetting } from './db'

async function populated(name: string): Promise<LabDB> {
  const db = new LabDB(name)
  await ensureSeeded(db, 1000)
  const exercise = seedExerciseById.get('count-high-write')!
  const session = await startSession('learn', [exercise.id], db, 2000)
  await recordAttempt(
    {
      exerciseId: exercise.id, exerciseVersion: exercise.version, sessionId: session.id, ts: 3000, mode: 'write',
      submitted: 'def count_high(m):\n    return 0\n', verdict: 'partial', reasoning: 'unsound', errorClass: 'logic',
      hintsUsed: 1, revealed: false, independent: false,
    },
    db,
    exercise,
  )
  const second = await recordAttempt(
    {
      exerciseId: exercise.id, exerciseVersion: exercise.version, sessionId: session.id, ts: 4000, mode: 'write',
      submitted: 'def count_high(m)\n', verdict: 'incorrect', reasoning: 'unknown', errorClass: 'syntax',
      hintsUsed: 1, revealed: false, independent: false,
    },
    db,
    exercise,
  )
  await regradeAttempt(second, 'typo', db)
  await db.cards.put(applyReview((await db.cards.get('card-list-identity'))!, 'good', 5000, 'one list'))
  await setSetting('startLevel', 'fundamentals', db)
  await setSetting('anthropicApiKey', 'sk-should-never-be-exported', db)
  return db
}

describe('backup', () => {
  it('round-trips progress into a fresh database without losing attempts', async () => {
    const source = await populated('backup-source')
    const text = JSON.stringify(await exportBackup(source, new Date(0)))

    const target = new LabDB('backup-target')
    const result = await importBackup(parseBackup(text), target)
    expect(result).toEqual({ attempts: 2, cards: 25, sessions: 1 })

    expect(await target.attempts.toArray()).toEqual(await source.attempts.toArray())
    expect(await target.cards.toArray()).toEqual(await source.cards.toArray())
    expect(await target.sessions.toArray()).toEqual(await source.sessions.toArray())
    expect((await target.settings.get('startLevel'))?.value).toBe('fundamentals')
    expect((await target.cards.get('card-list-identity'))!.history[0].note).toBe('one list')
  })

  it('keeps the exercise version the learner actually saw', async () => {
    const source = await populated('backup-snapshots')
    const backup = await exportBackup(source)
    expect(backup.snapshots).toHaveLength(1)
    expect(backup.snapshots[0]).toMatchObject({ id: 'count-high-write', version: 1 })
    expect(backup.snapshots[0].tests?.length).toBeGreaterThan(0)
    expect(backup.lessons.exercises.length).toBeGreaterThan(40)
  })

  it('never exports or imports anything that looks like a key', async () => {
    const source = await populated('backup-secret')
    const text = JSON.stringify(await exportBackup(source))
    expect(text).not.toContain('sk-should-never-be-exported')
    const tampered = parseBackup(text)
    tampered.settings.push({ key: 'apiKey', value: 'sk-injected' })
    const target = new LabDB('backup-secret-target')
    await importBackup(tampered, target)
    expect(await target.settings.get('apiKey')).toBeUndefined()
  })

  it('replaces existing data rather than merging', async () => {
    const source = await populated('backup-replace-source')
    const target = await populated('backup-replace-target')
    await importBackup(parseBackup(JSON.stringify(await exportBackup(source))), target)
    expect(await target.attempts.count()).toBe(2)
    expect(await target.cards.count()).toBe(25)
  })

  it('rejects files that are not backups and leaves the data alone', async () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON')
    expect(() => parseBackup('{"format":"something-else"}')).toThrow('not a Python Learning Lab backup')
    expect(() => parseBackup(JSON.stringify({ format: 'python-learning-lab-backup', formatVersion: 99 }))).toThrow('newer version')
    expect(() => parseBackup(JSON.stringify({ format: 'python-learning-lab-backup', formatVersion: 1, attempts: [] }))).toThrow('missing its cards')
  })

  it('reset clears progress, and the cards are seeded again afterwards', async () => {
    const db = await populated('backup-reset')
    await resetAll(db)
    expect(await db.attempts.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    await ensureSeeded(db, 9000)
    expect(await db.cards.count()).toBe(25)
  })
})
