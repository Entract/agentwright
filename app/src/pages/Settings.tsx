import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONTENT_VERSION } from '../content'
import { exportBackup, importBackup, parseBackup, resetAll } from '../db/backup'
import { db, getSetting, setSetting } from '../db/db'
import { saveTextFile } from '../db/files'
import { useLive } from '../db/useLive'
import type { StartLevel } from '../learn/queue'
import { ensureSeeded } from '../learn/store'
import TutorSettings from '../components/TutorSettings'

type Message = { kind: 'ok' | 'bad'; text: string } | null

export default function Settings() {
  const level = useLive(() => getSetting<StartLevel>('startLevel', 'frontier'))
  const counts = useLive(async () => ({ attempts: await db.attempts.count(), cards: await db.cards.count() }))
  const [message, setMessage] = useState<Message>(null)
  const [confirm, setConfirm] = useState<'import' | 'reset' | null>(null)
  const pending = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function doExport() {
    try {
      const backup = await exportBackup()
      const name = `python-learning-lab-${backup.exportedAt.slice(0, 10)}.json`
      await saveTextFile(name, JSON.stringify(backup, null, 2))
      setMessage({ kind: 'ok', text: `Backup created: ${backup.attempts.length} answers and ${backup.cards.length} cards.` })
    } catch (err) {
      setMessage({ kind: 'bad', text: `Export failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    try {
      const text = await file.text()
      parseBackup(text)
      pending.current = text
      setConfirm('import')
      setMessage(null)
    } catch (err) {
      setMessage({ kind: 'bad', text: err instanceof Error ? err.message : String(err) })
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  async function doImport() {
    try {
      const result = await importBackup(parseBackup(pending.current ?? ''))
      await ensureSeeded()
      setMessage({ kind: 'ok', text: `Imported ${result.attempts} answers, ${result.cards} cards and ${result.sessions} sessions.` })
    } catch (err) {
      setMessage({ kind: 'bad', text: `Import failed; nothing was changed. ${err instanceof Error ? err.message : String(err)}` })
    }
    pending.current = null
    setConfirm(null)
  }

  async function doReset() {
    await resetAll()
    await ensureSeeded()
    setConfirm(null)
    setMessage({ kind: 'ok', text: 'All progress was removed.' })
  }

  return (
    <section className="page">
      <Link to="/" className="link">‹ Home</Link>
      <h1>Settings</h1>

      {message && <div className={`notice ${message.kind}`}>{message.text}</div>}

      <h2>Starting point</h2>
      <label htmlFor="level">Order of exercises in “Continue learning”</label>
      <select id="level" value={level ?? 'frontier'} onChange={(e) => setSetting('startLevel', e.target.value)}>
        <option value="frontier">From where the conversation stopped (writing functions first)</option>
        <option value="fundamentals">From the fundamentals, module by module</option>
      </select>

      <TutorSettings />

      <h2>Backup</h2>
      <p className="muted">
        A backup is one JSON file with every answer, review card, session and setting, plus the lessons as they were when you answered them. It never contains
        an API key. {counts ? `Currently stored: ${counts.attempts} answers, ${counts.cards} cards.` : ''}
      </p>
      <div className="row">
        <button onClick={doExport}>Export backup</button>
        <button onClick={() => fileInput.current?.click()}>Import backup</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => chooseFile(e.target.files?.[0])}
        />
      </div>
      {confirm === 'import' && (
        <div className="notice warn" style={{ marginTop: 12 }}>
          <p>Importing replaces everything stored in the app now with the contents of the file. This cannot be undone.</p>
          <div className="row">
            <button className="primary" onClick={doImport}>
              Replace my data
            </button>
            <button className="quiet" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <h2>Start again</h2>
      {confirm === 'reset' ? (
        <div className="notice bad">
          <p>This removes every answer, card and session from this device. Export a backup first if you might want them back.</p>
          <div className="row">
            <button className="primary" onClick={doReset}>
              Remove everything
            </button>
            <button className="quiet" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="quiet" onClick={() => setConfirm('reset')}>
          Remove all progress…
        </button>
      )}

      <h2>About</h2>
      <p className="muted">
        Python Learning Lab 0.2.0, course content version {CONTENT_VERSION}. Your code runs on this device in a sandboxed Python (Pyodide) inside a background
        worker, with a five-second limit. That is suitable for your own exercises; it is not a hardened security boundary for untrusted code.
      </p>
    </section>
  )
}
