import type Anthropic from '@anthropic-ai/sdk'
import type { Exercise } from '../types'
import type { RunRequest, RunResult } from '../runner/core'
import { estimateCost, type TutorClient, type Usage } from './anthropic'

const VARIANT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    code: { type: 'string' },
    hints: { type: 'array', items: { type: 'string' } },
    explanation: { type: 'string' },
  },
  required: ['title', 'code', 'hints', 'explanation'],
  additionalProperties: false,
} as const

const VARIANT_SYSTEM = `You write one practice exercise for a Python learner: a short program whose printed output they will predict.

Given an existing exercise, write a variant that tests the same single idea with different names and values.

Rules:
- Use only syntax that appears in the original program. Introduce nothing new.
- 4 to 14 lines. It must run on its own, print between 1 and 6 short lines, and finish instantly.
- No input(), no randomness, no dates or times, no network, no files unless the original uses files.
- Prefer measurements, balances and readings as subject matter.
- hints: two or three short questions that point at the idea without giving the output.
- explanation: two to four plain sentences on why the program prints what it prints. Do not quote the output; the app runs the program and shows the real output itself.
- title: a few words, no trailing punctuation.

Plain text only. No markdown.`

export interface VariantResult {
  exercise: Exercise
  usage: Usage
}

/**
 * Asks Claude for a variant of a predict exercise, then runs the code. The
 * expected output is whatever real Python printed, never what the model claims.
 * A variant that fails to run, or prints nothing, is rejected.
 */
export async function generateVariant(
  original: Exercise,
  client: TutorClient,
  model: string,
  run: (request: RunRequest) => Promise<RunResult>,
  now = Date.now(),
): Promise<VariantResult> {
  if (original.answer !== 'output' || !original.code) throw new Error('Variants are only made for predict-the-output exercises.')
  const message = await client.create({
    model,
    max_tokens: 16000,
    system: VARIANT_SYSTEM,
    messages: [{ role: 'user', content: `Idea being practised: ${original.title}\n\nOriginal program:\n${original.code}` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: VARIANT_SCHEMA } },
  })
  const usage: Usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    costUsd: estimateCost(message.model || model, message.usage.input_tokens, message.usage.output_tokens),
  }
  const fail = (reason: string) => Object.assign(new Error(reason), { usage })
  if (message.stop_reason !== 'end_turn') throw fail('The AI tutor did not finish writing a variant.')

  let draft: { title: string; code: string; hints: string[]; explanation: string }
  try {
    const text = message.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? ''
    draft = JSON.parse(text)
  } catch {
    throw fail('The variant could not be read.')
  }
  if (typeof draft.code !== 'string' || !draft.code.trim() || !Array.isArray(draft.hints) || typeof draft.explanation !== 'string') {
    throw fail('The variant was incomplete.')
  }
  const code = draft.code.replace(/\r\n/g, '\n').replace(/\n*$/, '\n')
  if (code.split('\n').length > 30) throw fail('The variant was too long.')

  const result = await run({ code, files: original.files })
  if (result.error) throw fail(`The variant did not run (${result.error.type}), so it was discarded.`)
  const output = result.stdout.replace(/\n+$/, '')
  if (!output.trim()) throw fail('The variant printed nothing, so it was discarded.')
  if (output.split('\n').length > 10) throw fail('The variant printed too much, so it was discarded.')

  return {
    usage,
    exercise: {
      id: `gen-${original.id}-${now}`,
      version: 1,
      topicIds: original.topicIds,
      mode: 'predict',
      answer: 'output',
      title: String(draft.title || `${original.title} (variant)`).slice(0, 80),
      prompt: 'What does this print? Put each printed line on its own line.',
      code,
      files: original.files,
      expectedOutput: output,
      hints: draft.hints.filter((h) => typeof h === 'string' && h.trim()).slice(0, 3),
      explanation: draft.explanation,
      difficulty: original.difficulty,
      source: 'generated',
      order: original.order + 1,
      misconception: original.misconception,
    },
  }
}
