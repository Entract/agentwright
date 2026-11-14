// Core records. These mirror section 7 of the build brief.

export type ModuleId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J'
export type Mode = 'predict' | 'explain' | 'fix' | 'complete' | 'write'
export type AnswerKind = 'output' | 'choice' | 'text' | 'code'
export type InitialStatus = 'practised' | 'review' | 'untested' | 'later'

export interface Topic {
  id: string
  module: ModuleId
  title: string
  prerequisites: string[]
  objective: string
  explanation: string
  initialStatus: InitialStatus
}

export type TestSpec =
  | { kind: 'call'; name: string; fn: string; args: unknown[]; expect: unknown }
  | { kind: 'stdout'; name: string; expect: string }
  | { kind: 'python'; name: string; code: string }
  /** Re-runs the whole program with different predefined variables. */
  | { kind: 'vars'; name: string; given: Record<string, unknown>; expectStdout?: string; expectVars?: Record<string, unknown> }

export interface Exercise {
  id: string
  /** Bumped whenever the prompt, code or tests change, so old attempts stay interpretable. */
  version: number
  topicIds: string[]
  mode: Mode
  answer: AnswerKind
  title: string
  prompt: string
  /** Code sample shown to the learner (predict / explain). */
  code?: string
  /** answer = 'output': verified by running `code`. */
  expectedOutput?: string
  /** answer = 'choice' */
  choices?: string[]
  correctChoice?: number
  /** answer = 'text': each idea is matched if any phrase appears in the answer. */
  rubric?: { idea: string; anyOf: string[] }[]
  /** answer = 'code' */
  starterCode?: string
  /** Variables defined before the learner's code runs, shown as "already defined". */
  given?: Record<string, unknown>
  files?: Record<string, string>
  tests?: TestSpec[]
  solution?: string
  /** The starter code never terminates, so automated checks must not run it. */
  starterHangs?: boolean
  hints: string[]
  /** Targeted feedback for specific wrong answers. `match` is compared after normalising. */
  wrongAnswers?: { match: string; feedback: string }[]
  /** Step-by-step execution shown by "Show execution". */
  trace?: string
  /** Full explanation, shown only on reveal or after a correct answer. */
  explanation: string
  /** Syntax introduced for the first time by this exercise. */
  newSyntax?: string[]
  difficulty: 1 | 2 | 3 | 4 | 5
  source: 'conversation' | 'seed' | 'generated' | 'imported'
  order: number
  misconception?: string
  diagnostic?: boolean
}

export type Verdict = 'correct' | 'partial' | 'incorrect'
export type ErrorClass = 'none' | 'typo' | 'syntax' | 'runtime' | 'logic' | 'misread' | 'concept'

export interface Attempt {
  id?: number
  exerciseId: string
  exerciseVersion: number
  sessionId?: number
  ts: number
  mode: Mode
  submitted: string
  /** JSON of the runner result for code attempts. */
  runResult?: string
  /** Outcome: was the answer right? */
  verdict: Verdict
  /** Reasoning: was the thinking sound, independent of the outcome? */
  reasoning: 'sound' | 'unsound' | 'unknown'
  errorClass: ErrorClass
  hintsUsed: number
  revealed: boolean
  /** Code written with no starter, no hints and no reveal. */
  independent: boolean
  confidence?: 1 | 2 | 3
  /** Set when the learner regrades: 'typo' or 'misread'. */
  regrade?: 'typo' | 'misread'
  feedback?: string
}

export interface CardReview {
  ts: number
  rating: 'again' | 'hard' | 'good'
  intervalDays: number
  note?: string
}

export interface ReviewCard {
  id: string
  topicId: string
  kind: 'recall' | 'oneliner'
  front: string
  back: string
  misconception?: string
  source: 'conversation' | 'practice' | 'generated' | 'manual'
  /** Epoch ms. */
  dueAt: number
  intervalDays: number
  /** Index into the fixed schedule; past the end the interval adapts. */
  step: number
  history: CardReview[]
  retired: boolean
  edited?: boolean
}

export interface Session {
  id?: number
  startedAt: number
  endedAt?: number
  kind: 'learn' | 'review' | 'lab' | 'diagnostic'
  exerciseIds: string[]
  /** Review cards added or brought forward by this session. */
  cardIds?: string[]
  reflections?: string
  usage?: { inputTokens: number; outputTokens: number; costUsd: number }
}

export interface Setting {
  key: string
  value: unknown
}
