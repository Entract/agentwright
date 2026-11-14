import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LabDB } from '../db/db'
import { seedExerciseById, seedExercises } from '../content'
import { gradeChoice, gradeOutput, gradeText, looseOutput, pyRepr } from './grade'
import { nextExercises } from './queue'
import {
  allExercises,
  endSession,
  ensureSeeded,
  getActiveSession,
  isConceptMiss,
  recordAttempt,
  regradeAttempt,
  saveActiveSession,
  scheduleReviewFor,
  startSession,
} from './store'
import type { Attempt } from '../types'

const ex = (id: string) => seedExerciseById.get(id)!

const attempt = (over: Partial<Attempt>): Omit<Attempt, 'id'> => ({
  exerciseId: 'alias-predict',
  exerciseVersion: 1,
  ts: 1000,
  mode: 'predict',
  submitted: '',
  verdict: 'incorrect',
  reasoning: 'unsound',
  errorClass: 'concept',
  hintsUsed: 0,
  revealed: false,
  independent: false,
  ...over,
})

describe('grading predictions', () => {
  const alias = ex('alias-predict')

  it('accepts the exact output', () => {
    expect(gradeOutput(alias, '[1, 2, 3]\nTrue False\nFalse\n')).toMatchObject({ verdict: 'correct', errorClass: 'none' })
  })

  it('accepts phone-keyboard formatting slips and records them as typos, not concept errors', () => {
    const g = gradeOutput(alias, '[1,2,3]\ntrue  false\n\nfalse')
    expect(g).toMatchObject({ verdict: 'correct', errorClass: 'typo', reasoning: 'sound' })
  })

  it('gives targeted feedback for a known wrong answer without revealing the answer', () => {
    const g = gradeOutput(alias, '[1, 2]\nFalse False\nFalse')
    expect(g.verdict).toBe('incorrect')
    expect(g.errorClass).toBe('concept')
    expect(g.flaw).toContain('b = a')
    expect(g.flaw).not.toContain('[1, 2, 3]')
  })

  it('says what was right and where the first difference is', () => {
    const g = gradeOutput(alias, '[1, 2, 3]\nTrue True\nFalse')
    expect(g.verdict).toBe('partial')
    expect(g.whatWasRight).toBe('The first line is right.')
    expect(g.flaw).toBe('Line 2 of your answer is the first that differs.')
  })

  it('does not treat a missing .0 as a formatting slip', () => {
    const g = gradeOutput(ex('float-division-predict'), '5\n3\n3.5\n10')
    expect(g.verdict).not.toBe('correct')
  })

  it('normalises quotes and spacing only', () => {
    expect(looseOutput('[ "a",\'b\' ]')).toBe(looseOutput("[ 'a', 'b' ]"))
    expect(looseOutput('1 2')).not.toBe(looseOutput('12'))
  })
})

describe('grading choices and explanations', () => {
  it('grades a choice', () => {
    const e = ex('while-continue-choice')
    expect(gradeChoice(e, 1).verdict).toBe('correct')
    expect(gradeChoice(e, 0)).toMatchObject({ verdict: 'incorrect', errorClass: 'concept' })
  })

  it('grades an explanation by ideas and reports partial credit without naming the missing idea', () => {
    const e = ex('alias-explain')
    expect(gradeText(e, 'There is only one list and a and b are two names for it').verdict).toBe('correct')
    const partial = gradeText(e, 'because it is the same list')
    expect(partial.verdict).toBe('partial')
    expect(partial.whatWasRight).toContain('there is only one list')
    expect(partial.flaw).toBe('One idea is still missing from your explanation.')
    expect(gradeText(e, 'append copies things').verdict).toBe('incorrect')
  })
})

describe('pyRepr', () => {
  it('writes values the way Python does', () => {
    expect(pyRepr({ name: 'B1', ok: true, note: null, readings: [10.2, 11.8] })).toBe(
      '{"name": "B1", "ok": True, "note": None, "readings": [10.2, 11.8]}',
    )
  })
})

describe('exercise queue', () => {
  it('starts at count_high and moves on once an exercise is answered correctly', () => {
    expect(nextExercises(seedExercises, [], 'frontier', 2).map((e) => e.id)).toEqual(['count-high-write', 'alias-predict'])
    const done = [attempt({ exerciseId: 'count-high-write', verdict: 'correct' }) as Attempt]
    expect(nextExercises(seedExercises, done, 'frontier', 1)[0].id).toBe('alias-predict')
  })

  it('does not count a wrong attempt, or a correct attempt on an older version, as passed', () => {
    const wrong = [attempt({ exerciseId: 'count-high-write', verdict: 'incorrect' }) as Attempt]
    expect(nextExercises(seedExercises, wrong, 'frontier', 1)[0].id).toBe('count-high-write')
    const old = [attempt({ exerciseId: 'count-high-write', verdict: 'correct', exerciseVersion: 0 }) as Attempt]
    expect(nextExercises(seedExercises, old, 'frontier', 1)[0].id).toBe('count-high-write')
  })

  it('can start from the fundamentals instead', () => {
    expect(nextExercises(seedExercises, [], 'fundamentals', 1)[0].topicIds[0].startsWith('a-')).toBe(true)
  })
})

describe('persistence', () => {
  let db: LabDB
  let n = 0
  beforeEach(() => {
    db = new LabDB(`test-${n++}`)
  })

  it('seeds review cards once', async () => {
    await ensureSeeded(db, 5000)
    await ensureSeeded(db, 9000)
    const cards = await db.cards.toArray()
    expect(cards).toHaveLength(25)
    const dueNow = cards.filter((c) => c.dueAt === 5000)
    expect(dueNow).toHaveLength(8)
    expect(dueNow.map((c) => c.id)).toEqual(expect.arrayContaining(['card-list-identity', 'card-mutation-vs-reassignment', 'card-independent-writing']))
    expect(cards.every((c) => c.dueAt >= 5000)).toBe(true)
    expect((await allExercises(db)).length).toBe(seedExercises.length)
  })

  it('keeps attempts, and a regrade marks a slip without changing the outcome', async () => {
    const id = await recordAttempt(attempt({ submitted: '[1, 2]' }), db)
    await regradeAttempt(id, 'typo', db)
    const reopened = new LabDB(db.name)
    const stored = await reopened.attempts.get(id)
    expect(stored).toMatchObject({ submitted: '[1, 2]', verdict: 'incorrect', regrade: 'typo', reasoning: 'sound', errorClass: 'typo' })
    expect(isConceptMiss(stored!)).toBe(false)
  })

  it('brings the misconception card forward after a concept miss, but not after a typing slip', async () => {
    await ensureSeeded(db, 1000)
    await db.cards.update('card-list-identity', { dueAt: 999999, step: 3, intervalDays: 7 })
    const alias = ex('alias-predict')

    const slip = attempt({ errorClass: 'syntax' }) as Attempt
    expect(await scheduleReviewFor(alias, [slip], db, 2000)).toBeNull()
    expect((await db.cards.get('card-list-identity'))!.dueAt).toBe(999999)

    const miss = attempt({}) as Attempt
    const card = await scheduleReviewFor(alias, [miss], db, 2000)
    expect(card?.id).toBe('card-list-identity')
    expect(await db.cards.get('card-list-identity')).toMatchObject({ dueAt: 2000, step: 0 })
  })

  it('creates a practice card for an exercise that has no seeded card', async () => {
    await ensureSeeded(db, 1000)
    const e = ex('dict-lookups-predict')
    const card = await scheduleReviewFor(e, [attempt({ exerciseId: e.id }) as Attempt], db, 2000)
    expect(card).toMatchObject({ id: 'practice-dict-lookups-predict', source: 'practice', dueAt: 2000 })
  })

  it('keeps the session position across a restart', async () => {
    const active = await startSession('learn', ['a', 'b', 'c'], db, 1000)
    await saveActiveSession({ ...active, index: 2, cardIds: ['card-x'] }, db)
    const reopened = new LabDB(db.name)
    expect(await getActiveSession(reopened)).toMatchObject({ id: active.id, index: 2 })
    await endSession(active.id, reopened, 5000)
    expect(await getActiveSession(reopened)).toBeNull()
    expect(await reopened.sessions.get(active.id)).toMatchObject({ endedAt: 5000, cardIds: ['card-x'] })
  })
})
