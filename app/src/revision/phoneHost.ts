// The phone's stand-in for the PC window's host program. It answers the same messages, so the
// Revision question layout and the mentor panel work on the phone as they do on the PC:
// programs run in the app's built-in Python with the key saved in Settings, and the mentor
// is called with the Anthropic TypeScript SDK and that same key.
import type Anthropic from '@anthropic-ai/sdk'
import { installLocalHost, type HostMessage, type Outgoing } from '../desktop/host'
import { getRunner } from '../runner/client'
import { canWaitForNetwork, needsNetwork } from '../runner/core'
import { describeError, estimateCost, sdkClient } from '../tutor/anthropic'
import { addUsage, getDailyUsage, getTutorConfig, loadApiKey, overLimit } from '../tutor/settings'

/** The mentor's model, the same one the PC window uses. */
const MENTOR_MODEL = 'claude-opus-5-5'
/** A program that is being talked to may run for a long while. */
const LIVE_TIMEOUT_MS = 30 * 60 * 1000

const listeners = new Set<(message: HostMessage) => void>()
const emit = (message: HostMessage) => listeners.forEach((listen) => listen(message))

async function savedKey(): Promise<string | null> {
  try {
    return await loadApiKey()
  } catch {
    return null
  }
}

async function hello(): Promise<void> {
  emit({ type: 'host', python: { path: 'built-in', version: 'built-in' }, hasKey: !!(await savedKey()), workDir: '' })
}

async function run(id: number, code: string): Promise<void> {
  const started = Date.now()
  const network = needsNetwork(code)
  const key = network ? await savedKey() : null
  if (network && !canWaitForNetwork()) {
    emit({ type: 'out', id, stream: 'err', text: 'This device cannot make API calls from Python yet: update "Android System WebView" (or Chrome) in the Play Store.\n' })
  }
  const result = await getRunner().run(
    { code, interactive: true, network, env: key ? { ANTHROPIC_API_KEY: key } : undefined, timeoutMs: LIVE_TIMEOUT_MS },
    (stream, text) => emit({ type: 'out', id, stream, text }),
  )
  const ms = Date.now() - started
  const error = result.error
  if (!error) {
    emit({ type: 'exit', id, code: 0, ms })
  } else if (error.type === 'Stopped') {
    emit({ type: 'exit', id, stopped: true, ms })
  } else if (error.kind === 'timeout' || error.kind === 'internal') {
    emit({ type: 'exit', id, ms, problem: error.message })
  } else {
    emit({ type: 'out', id, stream: 'err', text: error.traceback || `${error.type}: ${error.message}\n` })
    emit({ type: 'exit', id, code: 1, ms })
  }
}

let mentorStream: { abort(): void } | null = null

async function mentor(id: number, system: string, messages: { role: 'user' | 'assistant'; content: string }[]): Promise<void> {
  const done = (problem?: string, stopped = false) => emit({ type: 'mentorDone', id, problem: problem ?? null, stopped })
  const key = await savedKey()
  if (!key) return done('No API key is saved. Add one in Settings.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return done('You are offline, so the mentor cannot be reached.')
  const config = await getTutorConfig()
  if (overLimit(config, await getDailyUsage())) return done('Today’s AI spending limit is reached. You can raise it in Settings.')
  let stopped = false
  try {
    // In a development build only, a test can point the mentor at a local stand-in for the API.
    const testUrl = import.meta.env.DEV ? (localStorage.getItem('mentor-test-url') ?? undefined) : undefined
    const stream = sdkClient(key, testUrl).messages.stream({ model: MENTOR_MODEL, max_tokens: 16000, system, messages })
    mentorStream = {
      abort: () => {
        stopped = true
        stream.abort()
      },
    }
    stream.on('text', (text: string) => emit({ type: 'mentorText', id, text }))
    const final: Anthropic.Message = await stream.finalMessage()
    await addUsage(
      { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, costUsd: estimateCost(final.model || MENTOR_MODEL, final.usage.input_tokens, final.usage.output_tokens) },
      undefined,
    )
    if (final.stop_reason === 'refusal') done('The mentor declined to answer this.')
    else if (final.stop_reason === 'max_tokens') done('The reply was cut off because it was too long.')
    else done()
  } catch (error) {
    if (stopped) done(undefined, true)
    else done(`The mentor could not be reached: ${describeError(error)}.`)
  } finally {
    mentorStream = null
  }
}

function send(message: Outgoing): void {
  switch (message.type) {
    case 'hello':
      void hello()
      break
    case 'run':
      void run(message.id, message.code)
      break
    case 'stdin':
      getRunner().input(message.text)
      break
    case 'stop':
      getRunner().stop()
      break
    case 'key':
      window.location.hash = '#/settings'
      break
    case 'mentor':
      void mentor(message.id, message.system, message.messages)
      break
    case 'mentorStop':
      mentorStream?.abort()
      break
    default:
      // Folders, window sizes and the PC course mean nothing on the phone.
      break
  }
}

/** Makes the phone answer host messages. Called once, when the phone's Revision page loads. */
export function installPhoneHost(): void {
  installLocalHost({
    kind: 'phone',
    send,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  })
}
