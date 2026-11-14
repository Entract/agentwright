import type Anthropic from '@anthropic-ai/sdk'
import type { Exercise } from '../types'
import { estimateCost, leaksAnswer, type TutorClient, type Usage } from './anthropic'

/** Bumped whenever the chat instructions change. */
export const CHAT_PROMPT_VERSION = 1

/** Only this many recent turns are sent, so a long conversation never grows the request without limit. */
export const MAX_TURNS_SENT = 10

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatContext {
  /** The exercise on screen, if the question is asked from one. */
  exercise?: Exercise
  /** What the learner has typed so far. */
  answer?: string
  /** Outcome of the most recent check, in words. */
  lastCheck?: string
  /** True once the learner has answered correctly or revealed the solution. */
  solutionSeen: boolean
}

export const CHAT_SYSTEM_PROMPT = `You are the tutor inside a Python practice app, answering the learner's own questions. The learner is a scientist who reads Python fairly well and is learning to write it independently. They often type on a phone, so keep replies short: a few sentences, or a few lines of code when code is the clearest answer.

How to teach:
- Answer the question that was asked. Teach one idea at a time. Be accurate, encouraging and unsentimental. Do not inflate praise.
- Explain why Python behaves as it does, not only what the rule is. When they ask for the underlying model (names, objects, references), give it.
- If they are working on an exercise, stay on that exercise's own code. Do not swap in a different example to explain the same point, and do not rewrite their code for them.
- Define any keyword, method or operator the first time you use it.
- Never state what a piece of code prints unless you were given that output. If you are not certain, say so and suggest running it in the app's scratchpad.
- If you are unsure about a Python or API detail, say you are unsure. Do not invent function signatures. For the Claude API, tell them to check the current official documentation.
- Do not claim the learner has mastered something or is ready for anything.

Exercises and answers:
- When the context says the solution has NOT been seen, do not give the exercise's expected output, the correct option, or working code that solves it, even if asked directly. Help them get there: point at the smallest wrong assumption, ask one guiding question, or explain the concept with reference to the lines already on screen. If they ask for the answer outright, tell them the "Reveal solution" button appears after they check an answer, and offer a hint instead.
- When the context says the solution HAS been seen, you may discuss the answer freely.
- With no exercise in the context, answer general Python questions directly, with a small example if it helps.

Format: plain text only. No markdown, no headings, no bullet symbols, no emoji. Put code on its own lines, indented four spaces.`

function contextBlock(context: ChatContext): string {
  const { exercise } = context
  if (!exercise) return 'Context: a general question, not tied to an exercise.'
  const reference =
    exercise.answer === 'output'
      ? `Expected output:\n${exercise.expectedOutput}`
      : exercise.answer === 'choice'
        ? `Options: ${(exercise.choices ?? []).map((c, i) => `(${i + 1}) ${c}`).join(' ')}\nCorrect option: ${exercise.choices?.[exercise.correctChoice ?? 0]}`
        : exercise.answer === 'code'
          ? `Reference solution (one of many acceptable ones):\n${exercise.solution}`
          : `Ideas a good explanation covers: ${(exercise.rubric ?? []).map((r) => r.idea).join('; ')}`
  return [
    `Context: the learner is on this exercise. Mode: ${exercise.mode}. Title: ${exercise.title}.`,
    `Task: ${exercise.prompt}`,
    exercise.code ? `Code sample:\n${exercise.code}` : '',
    exercise.starterCode ? `Starter code:\n${exercise.starterCode}` : '',
    context.answer?.trim() ? `What the learner has typed so far:\n${context.answer}` : 'The learner has not typed an answer yet.',
    context.lastCheck ? `Most recent check: ${context.lastCheck}` : 'No answer has been checked yet.',
    context.solutionSeen
      ? 'The solution HAS been seen. You may discuss the answer.'
      : 'The solution has NOT been seen. Do not give it.',
    `For your eyes only:\n${reference}\nReference explanation: ${exercise.explanation}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Builds the request messages: fresh context each time, plus the most recent turns and the new question. */
export function buildChatMessages(context: ChatContext, history: ChatTurn[], question: string): Anthropic.Beta.BetaMessageParam[] {
  let recent = history.slice(-MAX_TURNS_SENT)
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1)
  const turns: ChatTurn[] = [...recent, { role: 'user', text: question }]
  return turns.map((turn, i) => ({
    role: turn.role,
    content: i === 0 ? `${contextBlock(context)}\n\nThe learner asks:\n${turn.text}` : turn.text,
  }))
}

export interface ChatReply {
  text: string
  usage: Usage
  /** True when the model's reply gave the answer away and was replaced. */
  withheld: boolean
}

export const WITHHELD_TEXT =
  'I started to give the answer away, so I have held that reply back. Ask me about the part that is confusing and I will point you towards it. If you want the answer itself, check an answer and then use “Reveal solution”.'

/** Sends one question. Throws an Error (carrying `usage` when tokens were spent) if no usable reply comes back. */
export async function askTutor(
  client: TutorClient,
  model: string,
  context: ChatContext,
  history: ChatTurn[],
  question: string,
): Promise<ChatReply> {
  const message = await client.create({
    model,
    max_tokens: 16000,
    system: CHAT_SYSTEM_PROMPT,
    messages: buildChatMessages(context, history, question),
    output_config: { effort: 'low' },
  })
  const usage: Usage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    costUsd: estimateCost(message.model || model, message.usage.input_tokens, message.usage.output_tokens),
  }
  const fail = (reason: string) => Object.assign(new Error(reason), { usage })
  if (message.stop_reason === 'refusal') throw fail('The tutor declined to answer that.')
  const text = message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
  if (!text) throw fail('The tutor sent an empty reply.')
  if (message.stop_reason === 'max_tokens') throw fail('The tutor reply was cut off.')
  if (context.exercise && !context.solutionSeen && leaksAnswer(context.exercise, text)) {
    return { text: WITHHELD_TEXT, usage, withheld: true }
  }
  return { text, usage, withheld: false }
}
