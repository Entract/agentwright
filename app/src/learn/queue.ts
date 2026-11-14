import type { Attempt, Exercise } from '../types'
import { topicById } from '../content'

export type StartLevel = 'frontier' | 'fundamentals'

/** An exercise is passed once its current version has a correct attempt. */
export function passedIds(exercises: Exercise[], attempts: Attempt[]): Set<string> {
  const version = new Map(exercises.map((e) => [e.id, e.version]))
  const passed = new Set<string>()
  for (const a of attempts) {
    if (a.verdict === 'correct' && version.get(a.exerciseId) === a.exerciseVersion) passed.add(a.exerciseId)
  }
  return passed
}

function ordered(exercises: Exercise[], level: StartLevel): Exercise[] {
  const list = [...exercises]
  if (level === 'frontier') return list.sort((a, b) => a.order - b.order)
  const moduleOf = (e: Exercise) => topicById.get(e.topicIds[0])?.module ?? 'Z'
  return list.sort((a, b) => moduleOf(a).localeCompare(moduleOf(b)) || a.difficulty - b.difficulty || a.order - b.order)
}

/**
 * The next exercises to study. Unpassed ones come first, in course order. When
 * everything is passed, the ones practised longest ago come round again.
 */
export function nextExercises(exercises: Exercise[], attempts: Attempt[], level: StartLevel, count: number): Exercise[] {
  const passed = passedIds(exercises, attempts)
  const inOrder = ordered(exercises, level)
  const open = inOrder.filter((e) => !passed.has(e.id))
  if (open.length >= count) return open.slice(0, count)
  const last = new Map<string, number>()
  for (const a of attempts) last.set(a.exerciseId, Math.max(last.get(a.exerciseId) ?? 0, a.ts))
  const again = inOrder.filter((e) => passed.has(e.id)).sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0))
  return [...open, ...again].slice(0, count)
}
