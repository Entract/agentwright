import Anthropic from '@anthropic-ai/sdk'
import type { ErrorClass, Exercise, Verdict } from '../types'
import type { TutorProvider, TutorRequest } from './provider'
import { localTutor } from './provider'

/** Bumped whenever the tutor's instructions change. Stored with each session's usage. */
export const TUTOR_PROMPT_VERSION = 1

export const DEFAULT_MODEL = 'claude-opus-5-5'

/** Behaviour contract from section 9 of the brief. */
export const TUTOR_SYSTEM_PROMPT = `You are the tutor inside a Python practice app. The learner is a scientist who reads Python fairly well and is learning to write it independently. They often type on a phone.

You are given one exercise, the learner's answer, and the result of a deterministic check that ran real Python. Reply with feedback on that one answer.

How to teach:
- Teach one idea at a time. Be accurate, encouraging and unsentimental. Do not inflate praise.
- First work out whether the learner was predicting output, explaining, or writing code, and respond to that.
- For a wrong answer, name the smallest incorrect assumption and invite another try. Do not give the answer, the expected output, or corrected code. The app has a separate "Reveal solution" button; revealing is never your job.
- Separate typing slips (a missing quote, colon, capital letter, or .0) from misunderstandings. If the reasoning is sound and only the typing is off, say so and classify it as a typo or syntax slip.
- Stay on the exercise's own code sample. Do not introduce a different example, and do not rewrite the sample.
- Do not use any keyword, method or operator the exercise has not shown without defining it first.
- Never state what code prints unless that output is given to you in the check result. Do not guess at output.
- A correct prediction is not evidence that the learner can write the code. Do not claim mastery or readiness for anything.
- If you are unsure about a Python or API detail, say you are unsure instead of inventing it.

The deterministic check is authoritative for predictions, multiple-choice answers and code: do not contradict its verdict. For written explanations there is only a rough keyword check, so judge the explanation yourself against the reference explanation.

Field guide:
- verdict: "correct", "partial" or "incorrect".
- what_was_right: one short sentence on what the learner got right, or an empty string if nothing can honestly be said.
- error_type: "none" for a correct answer; "typo" or "syntax" for typing slips; "misread" if they understood the idea but misread the task or code; "logic" for code that runs but does the wrong thing; "runtime" for code that crashes; "concept" for a misunderstanding.
- smallest_hint: at most two short sentences, usually a question, pointing at the wrong assumption. Empty string for a correct answer.
- offer_retry: true unless the answer is correct.

Write plainly. No markdown, no code blocks, no emoji.`

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
    what_was_right: { type: 'string' },
    error_type: { type: 'string', enum: ['none', 'typo', 'syntax', 'runtime', 'logic', 'misread', 'concept'] },
    smallest_hint: { type: 'string' },
    offer_retry: { type: 'boolean' },
  },
  required: ['verdict', 'what_was_right', 'error_type', 'smallest_hint', 'offer_retry'],
  additionalProperties: false,
} as const

const VERDICTS: Verdict[] = ['correct', 'partial', 'incorrect']
const ERROR_TYPES: ErrorClass[] = ['none', 'typo', 'syntax', 'runtime', 'logic', 'misread', 'concept']

/** USD per million tokens (input, output). Used only for the on-device spend estimate. */
const PRICES: Record<string, [number, number]> = {
  'claude-fable-5-2': [8, 40],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}
/** Unknown models are estimated at the most expensive listed rate, so the daily limit errs on the safe side. */
const FALLBACK_PRICE: [number, number] = [8, 40]

/** Models for which the skill guidance says to opt into server-side refusal fallbacks. */
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const [inPrice, outPrice] = PRICES[model] ?? FALLBACK_PRICE
  return (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

/** The slice of the SDK the tutor uses; tests replace it. */
export interface TutorClient {
  create(body: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage>
}

export function sdkClient(apiKey: string, baseURL?: string): Anthropic {
  // The key is typed in by the device owner at runtime and never bundled, so
  // calling the API directly from the app is acceptable here.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000, ...(baseURL ? { baseURL } : {}) })
}

function referenceFor(exercise: Exercise): string {
  if (exercise.answer === 'output') return `Expected output:\n${exercise.expectedOutput}`
  if (exercise.answer === 'choice') return `Correct option: ${exercise.choices?.[exercise.correctChoice ?? 0]}`
  if (exercise.answer === 'code') return `Reference solution (one of many acceptable ones):\n${exercise.solution}`
  return `Ideas a good explanation covers: ${(exercise.rubric ?? []).map((r) => r.idea).join('; ')}`
}

/** One compact message per answer. No chat history is sent, so the context never grows. */
export function buildUserMessage(request: TutorRequest): string {
  const { exercise, answer, grade } = request
  const parts = [
    `Mode: ${exercise.mode}. Answer type: ${exercise.answer}.`,
    `Task: ${exercise.prompt}`,
    exercise.code ? `Code sample:\n${exercise.code}` : '',
    exercise.starterCode ? `Starter code the learner began from:\n${exercise.starterCode}` : '',
    `For your eyes only, never to be quoted or paraphrased closely:\n${referenceFor(exercise)}\nReference explanation: ${exercise.explanation}`,
    `Learner's answer (attempt ${request.attemptNumber}, ${request.hintsShown} built-in hint${request.hintsShown === 1 ? '' : 's'} already shown):\n${answer || '(empty)'}`,
    `Deterministic check: verdict ${grade.verdict}, error class ${grade.errorClass}.${grade.flaw ? ` ${grade.flaw}` : ''}`,
    request.evidence ? `Evidence from running the code:\n${request.evidence}` : '',
  ]
  return parts.filter(Boolean).join('\n\n')
}

interface RawFeedback {
  verdict: Verdict
  what_was_right: string
  error_type: ErrorClass
  smallest_hint: string
  offer_retry: boolean
}

/** Checks the shape of the tutor's reply. A well-formed reply is still not proof that it is right. */
export function validateFeedback(value: unknown): RawFeedback {
  const v = value as Partial<RawFeedback> | null
  if (!v || typeof v !== 'object') throw new Error('The tutor reply was not an object.')
  if (!VERDICTS.includes(v.verdict as Verdict)) throw new Error('The tutor reply had an unknown verdict.')
  if (!ERROR_TYPES.includes(v.error_type as ErrorClass)) throw new Error('The tutor reply had an unknown error type.')
  if (typeof v.what_was_right !== 'string' || typeof v.smallest_hint !== 'string') throw new Error('The tutor reply was missing text fields.')
  if (typeof v.offer_retry !== 'boolean') throw new Error('The tutor reply was missing offer_retry.')
  if (v.smallest_hint.length > 600 || v.what_was_right.length > 400) throw new Error('The tutor reply was too long.')
  return v as RawFeedback
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** True when a hint gives away the answer: the expected output, the right option, or lines of the solution. */
export function leaksAnswer(exercise: Exercise, hint: string): boolean {
  const text = squash(hint)
  if (exercise.answer === 'output' && exercise.expectedOutput) {
    const whole = squash(exercise.expectedOutput)
    if (whole.length >= 3 && text.includes(whole)) return true
    const lines = exercise.expectedOutput.split('\n').map(squash).filter((l) => l.length >= 6)
    if (lines.length > 0 && lines.every((l) => text.includes(l))) return true
  }
  if (exercise.answer === 'choice' && exercise.choices) {
    if (text.includes(squash(exercise.choices[exercise.correctChoice ?? 0]))) return true
  }
  if (exercise.answer === 'code' && exercise.solution) {
    const starter = new Set((exercise.starterCode ?? '').split('\n').map(squash))
    const telling = exercise.solution.split('\n').map(squash).filter((l) => l.length >= 14 && !starter.has(l))
    if (telling.some((l) => text.includes(l))) return true
  }
  return false
}

export interface AnthropicTutorOptions {
  client: TutorClient
  model: string
  /** Called with the usage of every request, including ones whose reply was discarded. */
  onUsage?: (usage: Usage) => void | Promise<void>
}

/**
 * Asks Claude for feedback on one answer. The deterministic verdict stays in
 * charge for predictions, choices and code; Claude words the hint and grades
 * free-text explanations. Any failure falls back to the local tutor.
 */
export function anthropicTutor({ client, model, onUsage }: AnthropicTutorOptions): TutorProvider {
  return {
    id: `anthropic:${model}`,
    async feedback(request) {
      const local = await localTutor.feedback(request)
      const { exercise, grade } = request
      // Nothing to add to a correct, deterministically checked answer; skip the call and the cost.
      if (grade.verdict === 'correct' && exercise.answer !== 'text') return local
      if (grade.errorClass === 'none' && grade.verdict !== 'correct' && grade.reasoning === 'unknown' && !request.answer.trim()) return local

      let message: Anthropic.Beta.BetaMessage
      try {
        const useFallbacks = FALLBACK_MODELS.has(model)
        message = await client.create({
          model,
          max_tokens: 16000,
          system: TUTOR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserMessage(request) }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
          // If a safety classifier declines the request, let the API retry it on its recommended fallback model.
          ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        })
      } catch (error) {
        return { ...local, note: `AI tutor unavailable (${describeError(error)}). Showing the built-in feedback.` }
      }

      const usage: Usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        costUsd: estimateCost(message.model || model, message.usage.input_tokens, message.usage.output_tokens),
      }
      await onUsage?.(usage)

      if (message.stop_reason === 'refusal') return { ...local, usage, note: 'The AI tutor declined this request. Showing the built-in feedback.' }
      if (message.stop_reason === 'max_tokens') return { ...local, usage, note: 'The AI tutor reply was cut off. Showing the built-in feedback.' }

      let raw: RawFeedback
      try {
        const text = message.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')?.text ?? ''
        raw = validateFeedback(JSON.parse(text))
      } catch {
        return { ...local, usage, note: 'The AI tutor reply could not be read. Showing the built-in feedback.' }
      }

      if (raw.verdict !== 'correct' && leaksAnswer(exercise, `${raw.smallest_hint} ${raw.what_was_right}`)) {
        return { ...local, usage, note: 'The AI tutor hint gave too much away, so the built-in feedback is shown instead.' }
      }

      const aiDecides = exercise.answer === 'text'
      const verdict = aiDecides ? raw.verdict : grade.verdict
      // A slip class from the tutor is accepted; it may not turn a failed check into a pass.
      const errorType: ErrorClass = verdict === 'correct' ? (grade.errorClass === 'typo' ? 'typo' : 'none') : raw.error_type === 'none' ? grade.errorClass : mergeErrorClass(grade.errorClass, raw.error_type, aiDecides)
      return {
        verdict,
        whatWasRight: raw.what_was_right || local.whatWasRight,
        errorType,
        smallestHint: verdict === 'correct' ? undefined : raw.smallest_hint || local.smallestHint,
        offerRetry: verdict !== 'correct',
        source: 'ai',
        usage,
      }
    },
  }
}

/** The runner knows for certain when code failed to parse or crashed; the tutor may refine only the softer classes. */
function mergeErrorClass(local: ErrorClass, ai: ErrorClass, aiDecides: boolean): ErrorClass {
  if (aiDecides) return ai
  if (local === 'syntax' || local === 'runtime') return local
  return ai
}

export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'the API key was not accepted'
  if (error instanceof Anthropic.PermissionDeniedError) return 'this key is not allowed to use that model'
  if (error instanceof Anthropic.NotFoundError) return 'that model was not found'
  if (error instanceof Anthropic.RateLimitError) return 'rate limit reached, try again shortly'
  if (error instanceof Anthropic.BadRequestError) return `the request was rejected: ${error.message}`
  if (error instanceof Anthropic.APIConnectionError) return 'no connection'
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? ''}`.trim()
  return error instanceof Error ? error.message : String(error)
}
