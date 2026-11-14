import type { ErrorClass, Exercise, Verdict } from '../types'
import { gradeRun, type RunResult } from '../runner/core'

export interface Grade {
  verdict: Verdict
  errorClass: ErrorClass
  /** Was the thinking sound, as far as a deterministic check can tell? */
  reasoning: 'sound' | 'unsound' | 'unknown'
  /** What the learner got right, when something can be said. */
  whatWasRight?: string
  /** The smallest statement of what is wrong. Never contains the answer. */
  flaw?: string
}

/** Exact comparison: line endings and trailing spaces are ignored, nothing else. */
export function normOutput(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

/** Forgiving comparison for phone typing: case, spacing, quote style and blank lines are ignored. */
export function looseOutput(text: string): string {
  return normOutput(text)
    .split('\n')
    .map((line) => line.trim().toLowerCase().replace(/[“”"‘’`]/g, "'").replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .join('\n')
}

export function gradeOutput(exercise: Exercise, answer: string): Grade {
  const expected = normOutput(exercise.expectedOutput ?? '')
  const given = normOutput(answer)
  if (given === '') return { verdict: 'incorrect', errorClass: 'none', reasoning: 'unknown', flaw: 'No answer was entered.' }
  if (given === expected) return { verdict: 'correct', errorClass: 'none', reasoning: 'sound' }
  if (looseOutput(given) === looseOutput(expected)) {
    return {
      verdict: 'correct',
      errorClass: 'typo',
      reasoning: 'sound',
      whatWasRight: 'Every value and every line is right.',
      flaw: 'Only the formatting differs from what Python shows (spacing, capitals or quote marks). That is a typing detail and is not counted against you.',
    }
  }
  const targeted = exercise.wrongAnswers?.find((w) => looseOutput(w.match) === looseOutput(given))
  const expectedLines = looseOutput(expected).split('\n')
  const givenLines = looseOutput(given).split('\n')
  let matching = 0
  while (matching < expectedLines.length && matching < givenLines.length && expectedLines[matching] === givenLines[matching]) matching++
  const whatWasRight = matching > 0 ? `The first ${matching === 1 ? 'line is' : `${matching} lines are`} right.` : undefined
  let flaw: string
  if (targeted) flaw = targeted.feedback
  else if (expectedLines.length !== givenLines.length && matching === Math.min(expectedLines.length, givenLines.length)) {
    flaw = givenLines.length < expectedLines.length ? 'The program prints more lines than you wrote.' : 'The program prints fewer lines than you wrote.'
  } else flaw = `Line ${matching + 1} of your answer is the first that differs.`
  return { verdict: matching > 0 ? 'partial' : 'incorrect', errorClass: 'concept', reasoning: 'unsound', whatWasRight, flaw }
}

export function gradeChoice(exercise: Exercise, choice: number | null): Grade {
  if (choice === null) return { verdict: 'incorrect', errorClass: 'none', reasoning: 'unknown', flaw: 'No option was chosen.' }
  if (choice === exercise.correctChoice) return { verdict: 'correct', errorClass: 'none', reasoning: 'sound' }
  return { verdict: 'incorrect', errorClass: 'concept', reasoning: 'unsound', flaw: 'That option does not match what Python does here.' }
}

/**
 * Explanations are checked against a list of ideas. This is a coarse keyword
 * check, so the learner can always overrule it, and the AI tutor replaces it when enabled.
 */
export function gradeText(exercise: Exercise, answer: string): Grade {
  const text = answer.toLowerCase()
  if (text.trim().length < 3) return { verdict: 'incorrect', errorClass: 'none', reasoning: 'unknown', flaw: 'No explanation was entered.' }
  const rubric = exercise.rubric ?? []
  const hit = rubric.filter((r) => r.anyOf.some((phrase) => text.includes(phrase.toLowerCase())))
  const missing = rubric.length - hit.length
  const whatWasRight = hit.length ? `You covered: ${hit.map((h) => h.idea.toLowerCase()).join('; ')}.` : undefined
  if (missing === 0) return { verdict: 'correct', errorClass: 'none', reasoning: 'sound', whatWasRight }
  const flaw =
    missing === 1 ? 'One idea is still missing from your explanation.' : `${missing} ideas are still missing from your explanation.`
  return { verdict: hit.length ? 'partial' : 'incorrect', errorClass: 'concept', reasoning: hit.length ? 'unknown' : 'unsound', whatWasRight, flaw }
}

export function gradeCode(result: RunResult): Grade {
  const { verdict, errorClass } = gradeRun(result)
  const passed = result.tests.filter((t) => t.passed).length
  const whatWasRight = passed > 0 && verdict !== 'correct' ? `${passed} of ${result.tests.length} tests pass.` : undefined
  if (verdict === 'correct') return { verdict, errorClass, reasoning: 'sound' }
  if (errorClass === 'syntax') {
    return {
      verdict,
      errorClass,
      reasoning: 'unknown',
      flaw: 'Python could not read the code, so the logic was not tested. This is recorded as a typing slip, not as a misunderstanding.',
    }
  }
  if (result.error?.kind === 'timeout') return { verdict, errorClass: 'logic', reasoning: 'unsound', flaw: 'The program never finished, so the tests could not run.' }
  if (errorClass === 'runtime') return { verdict, errorClass, reasoning: 'unknown', whatWasRight, flaw: 'The code stopped with an error while running.' }
  if (errorClass === 'misread') return { verdict, errorClass, reasoning: 'unknown', whatWasRight, flaw: 'Something the task asked for is missing or named differently.' }
  return { verdict, errorClass, reasoning: 'unsound', whatWasRight, flaw: 'The code runs, but a result is different from what the task asks for.' }
}

/** Shows a JavaScript value the way Python would write it. */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}: ${pyRepr(v)}`).join(', ')}}`
  }
  return String(value)
}
