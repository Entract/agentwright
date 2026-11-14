import { useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import CodeEditor from '../components/CodeEditor'
import ExerciseView from '../components/ExerciseView'
import RunOutput from '../components/RunOutput'
import { db, getSetting, setSetting } from '../db/db'
import { useLive } from '../db/useLive'
import { allExercises } from '../learn/store'
import { getRunner } from '../runner/client'
import { canWaitForNetwork, needsNetwork, type RunResult } from '../runner/core'
import { loadApiKey } from '../tutor/settings'
import type { Attempt, Exercise } from '../types'

const SAMPLE = `readings = [9.5, 10.2, 11.8]
for reading in readings:
    print(reading)
`

/** A program that waits on the network gets minutes, not the usual five seconds. */
const NETWORK_TIMEOUT_MS = 180000

const OUTCOME = { correct: 'Correct', partial: 'Partly correct', incorrect: 'Not yet' } as const
const ERROR_LABEL: Record<Attempt['errorClass'], string> = {
  none: '',
  typo: 'typing slip',
  syntax: 'syntax slip',
  runtime: 'runtime error',
  logic: 'logic error',
  misread: 'misread requirement',
  concept: 'concept',
}

export function statusOf(exercise: Exercise, attempts: Attempt[]): string {
  const mine = attempts.filter((a) => a.exerciseId === exercise.id)
  if (mine.length === 0) return 'Not started'
  const correct = mine.filter((a) => a.verdict === 'correct')
  if (correct.some((a) => a.independent)) return 'Written independently'
  if (correct.length) return exercise.answer === 'code' ? 'Solved with help' : 'Answered correctly'
  return 'Attempted'
}

function LabList() {
  const exercises = useLive(async () => {
    return allExercises()
  })
  const attempts = useLive(() => db.attempts.toArray())
  if (!exercises || !attempts) return <p className="muted">Loading…</p>
  const code = exercises.filter((e) => e.answer === 'code')
  const groups: [string, Exercise[]][] = [
    ['Write from a requirement', code.filter((e) => e.mode === 'write')],
    ['Fix broken code', code.filter((e) => e.mode !== 'write')],
    ['Variants written by the AI tutor (output checked by real Python)', exercises.filter((e) => e.source === 'generated')],
  ]
  return (
    <>
      <h1>Write Python</h1>
      <Link to="scratch" className="menu-item" style={{ marginBottom: 12 }}>
        <span className="menu-title">Scratchpad</span>
        <span className="muted">Try anything. Nothing is graded.</span>
      </Link>
      {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
        <div key={title}>
          <h2>{title}</h2>
          <ul className="menu">
            {list.map((e) => (
              <li key={e.id}>
                <Link to={e.id} className="menu-item">
                  <span className="menu-title">{e.title}</span>
                  <span className="muted">{statusOf(e, attempts)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function Scratchpad() {
  const [code, setCode] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    getRunner().warm()
    getSetting('scratchpad', SAMPLE).then(setCode)
  }, [])

  if (code === null) return <p className="muted">Loading…</p>

  async function run() {
    const source = code ?? ''
    setRunning(true)
    setNote('')
    await setSetting('scratchpad', source)
    if (!needsNetwork(source)) {
      setResult(await getRunner().run({ code: source }))
      setRunning(false)
      return
    }
    // A program that imports anthropic makes real API calls with the key saved in Settings.
    const key = await loadApiKey().catch(() => null)
    setNote(
      !canWaitForNetwork()
        ? 'This program uses the anthropic library. It can be imported here, but this device cannot make API calls from Python: update “Android System WebView” (or Chrome) in the Play Store to enable them.'
        : key
        ? 'This program uses the anthropic library, so it can make real API calls with your saved key. The first run takes a few seconds to load the library.'
        : 'This program uses the anthropic library, but no API key is saved. Add one in Settings → AI tutor, or calls will be refused.',
    )
    setResult(null)
    setResult(await getRunner().run({ code: source, network: true, env: key ? { ANTHROPIC_API_KEY: key } : undefined, timeoutMs: NETWORK_TIMEOUT_MS }))
    setRunning(false)
  }

  return (
    <>
      <h1>Scratchpad</h1>
      <CodeEditor value={code} onChange={setCode} minHeight="220px" />
      <div className="row" style={{ margin: '10px 0' }}>
        <button className="primary" onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </button>
        {running && (
          <button className="quiet" onClick={() => getRunner().stop()}>
            Stop
          </button>
        )}
        <button
          className="quiet"
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => undefined)
          }}
        >
          Copy
        </button>
        <button className="quiet" onClick={() => setCode('')}>
          Clear
        </button>
      </div>
      {note && <p className="muted small">{note}</p>}
      {result && <RunOutput result={result} />}
    </>
  )
}

function History({ exerciseId, onLoad }: { exerciseId: string; onLoad?: (code: string) => void }) {
  const attempts = useLive(() => db.attempts.where('exerciseId').equals(exerciseId).reverse().sortBy('ts'), [exerciseId])
  if (!attempts || attempts.length === 0) return null
  return (
    <>
      <h2>Attempt history</h2>
      {attempts.map((a) => (
        <details key={a.id} className="card">
          <summary>
            <span className={`verdict ${a.verdict}`}>{OUTCOME[a.verdict]}</span>
            {ERROR_LABEL[a.errorClass] && <span className="muted"> · {ERROR_LABEL[a.errorClass]}</span>}
            {a.independent && a.verdict === 'correct' && <span className="muted"> · independent</span>}
            {a.hintsUsed > 0 && <span className="muted"> · {a.hintsUsed} hint{a.hintsUsed > 1 ? 's' : ''}</span>}
            {a.revealed && <span className="muted"> · after reveal</span>}
            <span className="muted"> · {new Date(a.ts).toLocaleString()}</span>
          </summary>
          <pre className="code" style={{ marginTop: 8 }}>{a.submitted || '(empty)'}</pre>
          {onLoad && (
            <button className="quiet" onClick={() => onLoad(a.submitted)}>
              Load into editor
            </button>
          )}
        </details>
      ))}
    </>
  )
}

function LabExercise() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exercise, setExercise] = useState<Exercise | null | undefined>(undefined)
  const [loaded, setLoaded] = useState<{ code: string; n: number } | null>(null)

  useEffect(() => {
    allExercises().then((all) => setExercise(all.find((e) => e.id === id) ?? null))
    setLoaded(null)
  }, [id])

  if (exercise === undefined) return <p className="muted">Loading…</p>
  if (exercise === null) return <p>That exercise does not exist.</p>

  return (
    <>
      <Link to="/lab" className="link">‹ All exercises</Link>
      <div style={{ height: 8 }} />
      <ExerciseView
        key={`${exercise.id}-${loaded?.n ?? 0}`}
        exercise={exercise}
        initialAnswer={loaded?.code}
        nextLabel="Back to the list"
        onNext={() => navigate('/lab')}
        onVariant={(variant) => navigate(`/lab/${variant.id}`)}
      />
      <History
        exerciseId={exercise.id}
        onLoad={exercise.answer === 'code' ? (code) => setLoaded({ code, n: (loaded?.n ?? 0) + 1 }) : undefined}
      />
    </>
  )
}

export default function Lab() {
  return (
    <section className="page">
      <Routes>
        <Route index element={<LabList />} />
        <Route path="scratch" element={<Scratchpad />} />
        <Route path=":id" element={<LabExercise />} />
      </Routes>
    </section>
  )
}
