import { useEffect, useState } from 'react'
import { useLive } from '../db/useLive'
import { describeError, sdkClient, TUTOR_PROMPT_VERSION } from '../tutor/anthropic'
import {
  DEFAULT_CONFIG,
  getDailyUsage,
  getTutorConfig,
  keyStorageIsProtected,
  loadApiKey,
  removeApiKey,
  saveApiKey,
  saveTutorConfig,
  type TutorConfig,
} from '../tutor/settings'

type Status = { kind: 'ok' | 'bad' | 'warn'; text: string } | null

/** Optional Claude tutor: on/off, key, model and daily spending limit. Everything else works without it. */
export default function TutorSettings() {
  const stored = useLive(() => getTutorConfig())
  const usage = useLive(() => getDailyUsage())
  const [config, setConfig] = useState<TutorConfig>(DEFAULT_CONFIG)
  const [hasKey, setHasKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (stored) setConfig(stored)
  }, [stored])

  useEffect(() => {
    loadApiKey().then((k) => setHasKey(!!k)).catch(() => setHasKey(false))
  }, [])

  async function update(patch: Partial<TutorConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    await saveTutorConfig(next)
  }

  async function saveKey() {
    if (!keyInput.trim()) return
    try {
      await saveApiKey(keyInput)
      setKeyInput('')
      setHasKey(true)
      setStatus({ kind: 'ok', text: 'Key saved on this device. Use “Check key and model” to confirm it works.' })
    } catch (err) {
      setStatus({ kind: 'bad', text: `The key could not be saved: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  async function forgetKey() {
    await removeApiKey()
    setHasKey(false)
    await update({ enabled: false })
    setStatus({ kind: 'ok', text: 'Key removed from this device. The AI tutor is off.' })
  }

  /** Confirms the key is accepted and the model exists, without spending any tokens. */
  async function check() {
    setChecking(true)
    setStatus(null)
    try {
      const key = await loadApiKey()
      if (!key) throw new Error('No key is saved yet.')
      const model = await sdkClient(key).models.retrieve(config.model.trim())
      setStatus({ kind: 'ok', text: `The key works and the model is available: ${model.display_name} (${model.id}).` })
    } catch (err) {
      setStatus({ kind: 'bad', text: `Check failed: ${describeError(err)}.` })
    }
    setChecking(false)
  }

  const protectedStore = keyStorageIsProtected()

  return (
    <>
      <h2>AI tutor (optional)</h2>
      <p className="muted">
        With the tutor on, a wrong answer is sent to Claude for a more specific hint, written explanations are judged by Claude instead of a keyword check, and you can type questions to the tutor from any exercise or from Home.
        Answers to predictions and code are always checked by real Python on this device. Lessons, tests and review all work with the tutor off.
      </p>

      {status && <div className={`notice ${status.kind}`}>{status.text}</div>}

      <label className="choice" style={{ alignItems: 'center' }}>
        <input type="checkbox" checked={config.enabled} disabled={!hasKey} onChange={(e) => update({ enabled: e.target.checked })} />
        <span>{config.enabled ? 'AI tutor is on' : hasKey ? 'AI tutor is off (offline practice)' : 'AI tutor is off. Save a key to turn it on.'}</span>
      </label>

      <label htmlFor="apikey">Anthropic API key</label>
      <input
        id="apikey"
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={hasKey ? 'A key is saved. Type a new one to replace it.' : 'sk-ant-…'}
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={saveKey} disabled={!keyInput.trim()}>
          Save key
        </button>
        {hasKey && (
          <button className="quiet" onClick={forgetKey}>
            Remove key
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {protectedStore
          ? 'The key is kept in Android’s protected key storage on this phone. It is never shown again, and never included in a backup.'
          : 'In a browser the key is kept in this browser’s storage without protection. Use the Android app to keep it in protected storage. It is never included in a backup.'}
      </p>

      <label htmlFor="model">Model</label>
      <input id="model" type="text" className="mono" autoCapitalize="off" spellCheck={false} value={config.model} onChange={(e) => update({ model: e.target.value })} />
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={check} disabled={!hasKey || checking}>
          {checking ? 'Checking…' : 'Check key and model'}
        </button>
        {config.model !== DEFAULT_CONFIG.model && (
          <button className="quiet" onClick={() => update({ model: DEFAULT_CONFIG.model })}>
            Use default
          </button>
        )}
      </div>

      <label htmlFor="limit">Daily spending limit (US dollars, estimated)</label>
      <input
        id="limit"
        type="number"
        min="0"
        step="0.1"
        value={config.dailyLimitUsd}
        onChange={(e) => update({ dailyLimitUsd: Math.max(0, Number(e.target.value) || 0) })}
      />
      <p className="muted" style={{ marginTop: 8 }}>
        {usage
          ? `Today: ${usage.requests} request${usage.requests === 1 ? '' : 's'}, ${usage.inputTokens + usage.outputTokens} tokens, about $${usage.costUsd.toFixed(3)}.`
          : ''}{' '}
        When the limit is reached the built-in feedback takes over until tomorrow. The amount is an estimate from token counts, not a bill.
      </p>
      <p className="muted">
        What is sent: the exercise, your answer, and the result of the check. When you ask a question, the last few turns of that conversation are sent too. No history of earlier answers is sent. Tutor instructions version{' '}
        {TUTOR_PROMPT_VERSION}.
      </p>
    </>
  )
}
