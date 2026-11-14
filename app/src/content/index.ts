import type { Exercise, ReviewCard } from '../types'
import { readExercises } from './exercisesRead'
import { writeExercises } from './exercisesWrite'
import { misconceptions } from './misconceptions'

export { modules, topics, topicById } from './topics'
export { misconceptions, misconceptionById } from './misconceptions'

/** Bumped when seed content changes. Exercises also carry their own version. */
export const CONTENT_VERSION = 1

export const seedExercises: Exercise[] = [...writeExercises, ...readExercises].sort((a, b) => a.order - b.order)

export const seedExerciseById = new Map(seedExercises.map((e) => [e.id, e]))

/** Misconceptions the brief asks to prioritise in review. */
export const PRIORITY_MISCONCEPTIONS = ['list-identity', 'mutation-vs-reassignment', 'independent-writing']

const oneLiners: { id: string; topicId: string; front: string; back: string }[] = [
  { id: 'one-increment', topicId: 'a-variables', front: 'Write one line that adds 1 to count.', back: 'count = count + 1\n\n(count += 1 also works.)' },
  { id: 'one-for', topicId: 'b-for', front: 'Write the loop line that visits each reading in readings.', back: 'for reading in readings:' },
  { id: 'one-call', topicId: 'g-loop-records', front: 'Write one line that calls count_high with measurements and stores the result in total.', back: 'total = count_high(measurements)' },
  { id: 'one-return', topicId: 'c-return', front: 'Write the line that sends status back from a function.', back: 'return status' },
  { id: 'one-get', topicId: 'd-dict-access', front: 'Write an expression that looks up "unit" in reading and gives "g" when it is missing.', back: 'reading.get("unit", "g")' },
  { id: 'one-copy', topicId: 'd-identity', front: 'Write one line that makes b a separate copy of the list a.', back: 'b = list(a)\n\n(b = a[:] and b = a.copy() also work.)' },
  { id: 'one-append-file', topicId: 'e-files', front: 'Write the line that opens log.txt for appending, as f.', back: 'with open("log.txt", "a") as f:' },
  { id: 'one-elif', topicId: 'b-conditions', front: 'After "if mass < 9.5:", write the line that tests for mass up to and including 10.5.', back: 'elif mass <= 10.5:' },
]

const DAY = 24 * 60 * 60 * 1000
/** Cards due on the first day. The rest follow tomorrow and in three days, so the first review is short. */
const FIRST_BATCH = 8

/**
 * Seed review cards: one recall card per misconception, plus "write a one-liner" cards.
 * The weak areas named in the brief come first and are due at once.
 */
export function seedCards(now: number): ReviewCard[] {
  const base = { source: 'conversation' as const, intervalDays: 0, step: 0, history: [], retired: false }
  const rank = (id: string) => (PRIORITY_MISCONCEPTIONS.includes(id) ? 0 : 1)
  const recall = [...misconceptions]
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((m) => ({ id: `card-${m.id}`, topicId: m.topicId, kind: 'recall' as const, front: m.card.front, back: m.card.back, misconception: m.id }))
  const lines = oneLiners.map((o) => ({ id: `card-${o.id}`, topicId: o.topicId, kind: 'oneliner' as const, front: o.front, back: o.back }))
  // Interleave so each day mixes recall with writing a line.
  const mixed: (typeof recall[number] | typeof lines[number])[] = []
  for (let i = 0; i < Math.max(recall.length, lines.length); i++) {
    if (recall[i]) mixed.push(recall[i])
    if (i % 2 === 1 && lines[(i - 1) / 2]) mixed.push(lines[(i - 1) / 2])
  }
  for (const line of lines) if (!mixed.includes(line)) mixed.push(line)
  return mixed.map((card, i): ReviewCard => {
    const delayDays = i < FIRST_BATCH ? 0 : i < FIRST_BATCH * 2 ? 1 : 3
    return { ...base, ...card, dueAt: now + delayDays * DAY }
  })
}
