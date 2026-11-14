import { anthropicTutor, sdkClient, type TutorClient } from './anthropic'
import { localTutor, type TutorProvider } from './provider'
import { addUsage, getDailyUsage, getTutorConfig, loadApiKey, overLimit } from './settings'

export interface ChosenTutor {
  tutor: TutorProvider
  /** Why the AI tutor is not being used, when it is switched on but unavailable. */
  note?: string
}

/**
 * The tutor for the next answer. The AI tutor is used only when it is switched
 * on, a key is saved, the device is online and today's spend is under the limit.
 * In every other case the local tutor answers, so practice never stops.
 */
export async function getTutor(sessionId?: number): Promise<ChosenTutor> {
  const config = await getTutorConfig()
  if (!config.enabled) return { tutor: localTutor }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { tutor: localTutor, note: 'Offline: using the built-in feedback.' }
  if (overLimit(config, await getDailyUsage())) {
    return { tutor: localTutor, note: 'Today’s AI spending limit is reached: using the built-in feedback.' }
  }
  let key: string | null = null
  try {
    key = await loadApiKey()
  } catch {
    key = null
  }
  if (!key) return { tutor: localTutor, note: 'No API key is saved: using the built-in feedback.' }
  const client = sdkClient(key)
  return {
    tutor: anthropicTutor({
      client: { create: (body) => client.beta.messages.create(body) },
      model: config.model,
      onUsage: async (usage) => {
        await addUsage(usage, sessionId)
      },
    }),
  }
}

export type ChatAccess = { client: TutorClient; model: string } | { reason: string }

/** Whether the learner can ask the AI tutor a question right now, and if not, why not. */
export async function getChatAccess(): Promise<ChatAccess> {
  const config = await getTutorConfig()
  if (!config.enabled) return { reason: 'Asking questions needs the AI tutor, which is switched off.' }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { reason: 'You are offline, so the tutor cannot be reached.' }
  if (overLimit(config, await getDailyUsage())) return { reason: 'Today’s AI spending limit is reached. You can raise it in Settings.' }
  let key: string | null = null
  try {
    key = await loadApiKey()
  } catch {
    key = null
  }
  if (!key) return { reason: 'No API key is saved.' }
  const client = sdkClient(key)
  return { client: { create: (body) => client.beta.messages.create(body) }, model: config.model }
}
