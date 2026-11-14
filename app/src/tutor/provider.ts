import type { ErrorClass, Exercise, Verdict } from '../types'
import type { Grade } from '../learn/grade'

/** What a tutor is told about one answer. */
export interface TutorRequest {
  exercise: Exercise
  answer: string
  /** The deterministic grade. For output, choice and code answers this is authoritative. */
  grade: Grade
  /** 1 for the first answer to this exercise in this sitting. */
  attemptNumber: number
  hintsShown: number
  /** Short evidence from the runner for code answers (error or first failing test). */
  evidence?: string
}

/** Tutor response fields from section 9 of the brief. */
export interface TutorFeedback {
  verdict: Verdict
  whatWasRight?: string
  errorType: ErrorClass
  /** The smallest pointer to the wrong assumption. Never the full answer. */
  smallestHint?: string
  offerRetry: boolean
  source: 'local' | 'ai'
  usage?: { inputTokens: number; outputTokens: number; costUsd: number }
  /** Set when the AI tutor was asked but could not answer, and the local feedback is shown instead. */
  note?: string
}

export interface TutorProvider {
  id: string
  feedback(request: TutorRequest): Promise<TutorFeedback>
}

/** Works with no network: uses the deterministic grade and the curated feedback. */
export const localTutor: TutorProvider = {
  id: 'local',
  async feedback({ grade }) {
    return {
      verdict: grade.verdict,
      whatWasRight: grade.whatWasRight,
      errorType: grade.errorClass,
      smallestHint: grade.flaw,
      offerRetry: grade.verdict !== 'correct',
      source: 'local',
    }
  },
}
