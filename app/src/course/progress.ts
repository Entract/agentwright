// Saved state of the guided course: code, attempts, hints and passes per exercise.
// Pure functions, so the rules (what counts as independent, what counts as secure) are testable.
import { DIMENSIONS, dimensionOf, EXERCISES, exercise, isMilestone, START_ID, type Dimension } from './manifest'

export const PROGRESS_VERSION = 1
const MAX_ATTEMPTS = 60
const HOUR = 3600 * 1000
/** A concept is only "secure" after it is solved again, unaided, at least this long after the first pass. */
export const REVISIT_DELAY_MS = 20 * HOUR

export interface CheckCase {
  name: string
  visible: boolean
  passed: boolean
  message: string
  concept: string
}

export interface CheckReport {
  exercise: string
  syntaxError: { file: string; line: number | null; message: string; text: string } | null
  cases: CheckCase[]
  explanation: { point: string; found: boolean }[]
  explanationMissing?: boolean
  timedOut: boolean
  passed: number
  total: number
  ok: boolean
}

export interface Attempt {
  ts: number
  kind: 'run' | 'check'
  /** Highest hint shown when this attempt was made. */
  hints: number
  ok?: boolean
  passed?: number
  total?: number
  note?: string
}

export interface Pass {
  ts: number
  /** No hint and no solution had been shown for this attempt. */
  independent: boolean
}

export interface ExerciseProgress {
  files: Record<string, string>
  explanation: string
  hints: number
  solutionShown: boolean
  attempts: Attempt[]
  passes: Pass[]
  openedAt?: number
  /** Set by the learner's mentor ("mark 3B done"). Never counts as an independent pass. */
  markedDone?: number
  lastPassedFiles?: Record<string, string>
  lastReport?: CheckReport
  /** Project milestones: the program as it was when this milestone was opened, for showing what changed. */
  startedFrom?: string
}

export interface Progress {
  schemaVersion: number
  current: string
  exercises: Record<string, ExerciseProgress>
}

export type Status = 'new' | 'started' | 'marked' | 'helped' | 'independent' | 'secure'

export const STATUS_LABEL: Record<Status, string> = {
  new: 'Not started',
  started: 'In progress',
  marked: 'Marked done by mentor',
  helped: 'Passed with help',
  independent: 'Passed on your own',
  secure: 'Secure',
}

export function emptyProgress(): Progress {
  return { schemaVersion: PROGRESS_VERSION, current: START_ID, exercises: {} }
}

export function starterFiles(id: string, workspace?: Record<string, string>, entry = 'main.py'): Record<string, string> {
  const files = { ...(workspace ?? {}) }
  // The learner's own file comes first, so it is the first tab; supplied files follow.
  if (!(entry in files)) return { [entry]: (exercise(id)?.starter ?? '') + '\n', ...files }
  return files
}

export function blankExercise(id: string, workspace?: Record<string, string>, entry?: string): ExerciseProgress {
  const files = starterFiles(id, workspace, entry)
  const blank: ExerciseProgress = { files, explanation: '', hints: 0, solutionShown: false, attempts: [], passes: [] }
  if (isMilestone(id)) blank.startedFrom = files[entry ?? 'main.py'] ?? ''
  return blank
}

const BANNER = '# Now: '

/**
 * The program a project milestone opens with: the learner's own code from the milestone before,
 * under one comment line that names the new milestone. Earlier banner lines are dropped.
 * `where` says where the task is on this screen (beside the code on the PC, above it on the phone).
 */
export function carriedForward(previousCode: string, id: string, where = 'on the left'): string {
  const kept = previousCode.split('\n').filter((line) => !line.startsWith(BANNER))
  while (kept.length > 0 && kept[0].trim() === '') kept.shift()
  const todo = exercise(id)?.todo
  const banner = `${BANNER}${id}${todo ? ` - ${todo}` : ''}. The task is ${where}.`
  return [banner, ...kept].join('\n').replace(/\s+$/, '') + '\n'
}

/** Moves to an exercise without creating any saved state for it (a locked milestone has none yet). */
export function goTo(progress: Progress, id: string): Progress {
  return { ...progress, current: id }
}

/** Starts a milestone from a reference version of the one before. It can then only count as passed with help. */
export function startFromReference(progress: Progress, id: string, files: Record<string, string>, entry: string, now: number): Progress {
  const state: ExerciseProgress = { ...blankExercise(id, files, entry), solutionShown: true, openedAt: now }
  return { ...progress, current: id, exercises: { ...progress.exercises, [id]: state } }
}

export function exerciseState(progress: Progress, id: string, workspace?: Record<string, string>, entry?: string): ExerciseProgress {
  return progress.exercises[id] ?? blankExercise(id, workspace, entry)
}

function update(progress: Progress, id: string, change: (state: ExerciseProgress) => ExerciseProgress, workspace?: Record<string, string>, entry?: string): Progress {
  return { ...progress, exercises: { ...progress.exercises, [id]: change(exerciseState(progress, id, workspace, entry)) } }
}

export function openExercise(progress: Progress, id: string, now: number, workspace?: Record<string, string>, entry?: string): Progress {
  const next = update(progress, id, (s) => ({ ...s, openedAt: s.openedAt ?? now }), workspace, entry)
  return { ...next, current: id }
}

export function setFile(progress: Progress, id: string, name: string, text: string): Progress {
  return update(progress, id, (s) => ({ ...s, files: { ...s.files, [name]: text } }))
}

export function setExplanation(progress: Progress, id: string, text: string): Progress {
  return update(progress, id, (s) => ({ ...s, explanation: text }))
}

export function showHint(progress: Progress, id: string, tier: number): Progress {
  return update(progress, id, (s) => ({ ...s, hints: Math.max(s.hints, Math.min(3, tier)) }))
}

export function showSolution(progress: Progress, id: string): Progress {
  return update(progress, id, (s) => ({ ...s, solutionShown: true }))
}

/**
 * Back to the starter for a fresh attempt. The hint and solution flags are cleared so that a
 * later unaided solve can count as independent; the attempt and pass history is kept.
 */
export function resetExercise(progress: Progress, id: string, workspace?: Record<string, string>, entry?: string): Progress {
  return update(progress, id, (s) => {
    const files = starterFiles(id, workspace, entry)
    return { ...s, files, hints: 0, solutionShown: false, lastReport: undefined, startedFrom: isMilestone(id) ? (files[entry ?? 'main.py'] ?? '') : undefined }
  })
}

export function recordRun(progress: Progress, id: string, now: number, note?: string): Progress {
  return update(progress, id, (s) => ({ ...s, attempts: [...s.attempts, { ts: now, kind: 'run' as const, hints: s.hints, note }].slice(-MAX_ATTEMPTS) }))
}

export function recordCheck(progress: Progress, id: string, report: CheckReport, now: number): Progress {
  return update(progress, id, (s) => {
    const attempt: Attempt = { ts: now, kind: 'check', hints: s.hints, ok: report.ok, passed: report.passed, total: report.total }
    const next: ExerciseProgress = { ...s, attempts: [...s.attempts, attempt].slice(-MAX_ATTEMPTS), lastReport: report }
    if (report.ok) {
      next.passes = [...s.passes, { ts: now, independent: s.hints === 0 && !s.solutionShown }].slice(-20)
      next.lastPassedFiles = { ...s.files }
    }
    return next
  })
}

export function markDone(progress: Progress, id: string, now: number): Progress {
  return update(progress, id, (s) => ({ ...s, markedDone: now }))
}

export function unmarkDone(progress: Progress, id: string): Progress {
  return update(progress, id, (s) => ({ ...s, markedDone: undefined }))
}

export function statusOf(state: ExerciseProgress | undefined): Status {
  if (!state) return 'new'
  const independent = state.passes.filter((p) => p.independent)
  if (state.passes.length > 0) {
    const first = state.passes[0].ts
    if (independent.some((p) => p.ts - first >= REVISIT_DELAY_MS)) return 'secure'
    return independent.length > 0 ? 'independent' : 'helped'
  }
  if (state.markedDone) return 'marked'
  return state.attempts.length > 0 ? 'started' : 'new'
}

export function isDone(status: Status): boolean {
  return status !== 'new' && status !== 'started'
}

/** Milliseconds from first opening the exercise to the first passing check. */
export function timeToFirstPass(state: ExerciseProgress | undefined): number | null {
  if (!state?.openedAt || state.passes.length === 0) return null
  return Math.max(0, state.passes[0].ts - state.openedAt)
}

/** An exercise passed long enough ago to be worth solving again unaided, oldest first. */
export function revisitSuggestion(progress: Progress, now: number): string | null {
  const due = Object.entries(progress.exercises)
    .filter(([, s]) => s.passes.length > 0 && statusOf(s) !== 'secure' && now - s.passes[0].ts >= REVISIT_DELAY_MS)
    .sort((a, b) => a[1].passes[0].ts - b[1].passes[0].ts)
  return due.length > 0 ? due[0][0] : null
}

export interface DimensionSummary {
  id: Dimension
  label: string
  total: number
  passed: number
  independent: number
  secure: number
}

export function masterySummary(progress: Progress): DimensionSummary[] {
  return DIMENSIONS.map(({ id, label }) => {
    const members = EXERCISES.filter((e) => dimensionOf(e) === id)
    const statuses = members.map((e) => statusOf(progress.exercises[e.id]))
    return {
      id,
      label,
      total: members.length,
      passed: statuses.filter((s) => s === 'helped' || s === 'independent' || s === 'secure').length,
      independent: statuses.filter((s) => s === 'independent' || s === 'secure').length,
      secure: statuses.filter((s) => s === 'secure').length,
    }
  })
}

/** Reads saved or imported progress, tolerating older or damaged files without throwing. */
export function parseProgress(json: string | null | undefined): Progress | null {
  if (!json) return null
  try {
    const data = JSON.parse(json) as Partial<Progress>
    if (!data || typeof data !== 'object' || typeof data.exercises !== 'object' || data.exercises === null) return null
    const exercises: Record<string, ExerciseProgress> = {}
    for (const [id, value] of Object.entries(data.exercises)) {
      if (!exercise(id) || !value || typeof value !== 'object') continue
      const s = value as Partial<ExerciseProgress>
      if (!s.files || typeof s.files !== 'object') continue
      exercises[id] = {
        files: Object.fromEntries(Object.entries(s.files).filter(([, text]) => typeof text === 'string')),
        explanation: typeof s.explanation === 'string' ? s.explanation : '',
        hints: Math.max(0, Math.min(3, Number(s.hints) || 0)),
        solutionShown: !!s.solutionShown,
        attempts: Array.isArray(s.attempts) ? s.attempts.slice(-MAX_ATTEMPTS) : [],
        passes: Array.isArray(s.passes) ? s.passes.filter((p) => p && typeof p.ts === 'number') : [],
        openedAt: typeof s.openedAt === 'number' ? s.openedAt : undefined,
        markedDone: typeof s.markedDone === 'number' ? s.markedDone : undefined,
        lastPassedFiles: s.lastPassedFiles && typeof s.lastPassedFiles === 'object' ? s.lastPassedFiles : undefined,
        lastReport: s.lastReport,
        startedFrom: typeof s.startedFrom === 'string' ? s.startedFrom : undefined,
      }
    }
    const current = typeof data.current === 'string' && exercise(data.current) ? data.current : START_ID
    return { schemaVersion: PROGRESS_VERSION, current, exercises }
  } catch {
    return null
  }
}
