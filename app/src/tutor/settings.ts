import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { db as defaultDb, getSetting, setSetting, type LabDB } from '../db/db'
import { DEFAULT_MODEL, type Usage } from './anthropic'

const KEY_NAME = 'anthropic-api-key'

export interface TutorConfig {
  enabled: boolean
  model: string
  /** Estimated spend allowed per day, in US dollars. */
  dailyLimitUsd: number
}

export const DEFAULT_CONFIG: TutorConfig = { enabled: false, model: DEFAULT_MODEL, dailyLimitUsd: 0.5 }

export interface DailyUsage extends Usage {
  /** Local calendar day, YYYY-MM-DD. */
  day: string
  requests: number
}

export function dayOf(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function getTutorConfig(db: LabDB = defaultDb): Promise<TutorConfig> {
  return { ...DEFAULT_CONFIG, ...(await getSetting<Partial<TutorConfig>>('tutor', {}, db)) }
}

export async function saveTutorConfig(config: TutorConfig, db: LabDB = defaultDb): Promise<void> {
  await setSetting('tutor', config, db)
}

export async function getDailyUsage(db: LabDB = defaultDb, now = new Date()): Promise<DailyUsage> {
  const stored = await getSetting<DailyUsage | null>('tutorUsage', null, db)
  const day = dayOf(now)
  return stored && stored.day === day ? stored : { day, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
}

/** Adds one request to today's total and to the session it happened in. */
export async function addUsage(usage: Usage, sessionId: number | undefined, db: LabDB = defaultDb, now = new Date()): Promise<DailyUsage> {
  const today = await getDailyUsage(db, now)
  const next: DailyUsage = {
    day: today.day,
    requests: today.requests + 1,
    inputTokens: today.inputTokens + usage.inputTokens,
    outputTokens: today.outputTokens + usage.outputTokens,
    costUsd: today.costUsd + usage.costUsd,
  }
  await setSetting('tutorUsage', next, db)
  if (sessionId !== undefined) {
    const session = await db.sessions.get(sessionId)
    if (session) {
      const prev = session.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      await db.sessions.update(sessionId, {
        usage: {
          inputTokens: prev.inputTokens + usage.inputTokens,
          outputTokens: prev.outputTokens + usage.outputTokens,
          costUsd: prev.costUsd + usage.costUsd,
        },
      })
    }
  }
  return next
}

export function overLimit(config: TutorConfig, usage: DailyUsage): boolean {
  return usage.costUsd >= config.dailyLimitUsd
}

/** True when the key is held in Android's Keystore-backed storage rather than browser storage. */
export function keyStorageIsProtected(): boolean {
  return Capacitor.isNativePlatform()
}

// The key lives only in secure storage: never in the database, a backup, a log or the app bundle.
export async function saveApiKey(key: string): Promise<void> {
  await SecureStorage.set(KEY_NAME, key.trim())
}

export async function loadApiKey(): Promise<string | null> {
  const value = await SecureStorage.get(KEY_NAME)
  return typeof value === 'string' && value ? value : null
}

export async function removeApiKey(): Promise<void> {
  await SecureStorage.remove(KEY_NAME)
}
