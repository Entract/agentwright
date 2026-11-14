import { beforeAll, describe, expect, it } from 'vitest'
import { misconceptions, modules, seedCards, seedExerciseById, seedExercises, topicById, topics } from './index'
import { gradeRun, runWithPyodide, type PyodideLike } from '../runner/core'
import { testPyodide } from '../runner/testPyodide'

let py: PyodideLike
beforeAll(async () => {
  py = await testPyodide()
})

const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n+$/, '')

describe('seed structure', () => {
  it('has unique ids and valid topic references', () => {
    expect(new Set(seedExercises.map((e) => e.id)).size).toBe(seedExercises.length)
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length)
    for (const e of seedExercises) for (const id of e.topicIds) expect(topicById.has(id), `${e.id} -> ${id}`).toBe(true)
    for (const t of topics) for (const id of t.prerequisites) expect(topicById.has(id), `${t.id} -> ${id}`).toBe(true)
    expect(modules.map((m) => m.id).join('')).toBe('ABCDEFGHIJ')
  })

  it('covers all 17 misconceptions with a recall exercise, a coding exercise and a card', () => {
    expect(misconceptions).toHaveLength(17)
    const cards = seedCards(0)
    for (const m of misconceptions) {
      expect(topicById.has(m.topicId), m.id).toBe(true)
      expect(seedExerciseById.has(m.recallExerciseId), `${m.id} recall`).toBe(true)
      const coding = seedExerciseById.get(m.codingExerciseId)
      expect(coding?.answer, `${m.id} coding`).toBe('code')
      expect(cards.some((c) => c.misconception === m.id), `${m.id} card`).toBe(true)
    }
  })

  it('gives every exercise hints, an explanation and a complete answer definition', () => {
    for (const e of seedExercises) {
      expect(e.hints.length, e.id).toBeGreaterThan(0)
      expect(e.explanation.length, e.id).toBeGreaterThan(20)
      if (e.answer === 'output') expect(e.expectedOutput, e.id).toBeTruthy()
      if (e.answer === 'choice') expect(e.choices![e.correctChoice!], e.id).toBeTruthy()
      if (e.answer === 'text') expect(e.rubric!.length, e.id).toBeGreaterThan(0)
      if (e.answer === 'code') {
        expect(e.tests!.length, e.id).toBeGreaterThan(0)
        expect(e.solution, e.id).toBeTruthy()
      }
    }
  })

  it('starts with count_high, the next lesson named in the brief', () => {
    expect(seedExercises[0].id).toBe('count-high-write')
  })
})

describe('seed exercises agree with real Python', () => {
  for (const e of seedExercises.filter((x) => x.answer === 'output')) {
    it(`predict: ${e.id}`, () => {
      const r = runWithPyodide(py, { code: e.code!, files: e.files })
      expect(r.error, r.error?.traceback).toBeNull()
      expect(norm(r.stdout)).toBe(norm(e.expectedOutput!))
      for (const w of e.wrongAnswers ?? []) expect(norm(w.match), `${e.id} lists the right answer as wrong`).not.toBe(norm(e.expectedOutput!))
    })
  }

  for (const e of seedExercises.filter((x) => x.answer === 'code')) {
    it(`reference solution passes: ${e.id}`, () => {
      const r = runWithPyodide(py, { code: e.solution!, files: e.files, given: e.given, tests: e.tests })
      expect(r.error, r.error?.traceback).toBeNull()
      expect(r.tests.filter((t) => !t.passed)).toEqual([])
      expect(gradeRun(r).verdict).toBe('correct')
    })

    if (e.starterCode && !e.starterHangs) {
      it(`starter code does not already pass: ${e.id}`, () => {
        const r = runWithPyodide(py, { code: e.starterCode!, files: e.files, given: e.given, tests: e.tests })
        expect(gradeRun(r).verdict).not.toBe('correct')
      })
    }
  }

  it('an empty submission never passes a code exercise', () => {
    for (const e of seedExercises.filter((x) => x.answer === 'code')) {
      const r = runWithPyodide(py, { code: '', files: e.files, given: e.given, tests: e.tests })
      expect(gradeRun(r).verdict, e.id).not.toBe('correct')
    }
  })
})
