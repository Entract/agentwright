import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor'
import { exerciseContext } from '../course/context'
import '../course/course.css'
import { curriculumFiles } from '../course/curriculumFiles'
import generated from '../course/info.generated.json'
import { EXERCISES, FIXTURES, MODULES, START_ID, exercise, isMilestone, milestonesAfter, neighbour, onPriorityRoute, parseExerciseId, type CourseExercise } from '../course/manifest'
import { BriefDetail, BriefIntro, Changes, CourseMap, Inline, STATUS_MARK, StatusChip, TestReport, firstFile, startingPoint } from '../course/parts'
import {
  carriedForward, emptyProgress, exerciseState, goTo, isDone, markDone, openExercise, parseProgress, recordCheck, recordRun, resetExercise, setExplanation,
  setFile, showHint, showSolution, startFromReference, statusOf, unmarkDone, type CheckReport, type Progress,
} from '../course/progress'
import { WHY } from '../course/why'
import { getSetting, setSetting } from '../db/db'
import { saveTextFile } from '../db/files'
import type { CourseInfo } from '../desktop/host'
import { getRunner } from '../runner/client'
import type { CourseRequest } from '../runner/core'

/** Saved with the app's other settings, so the app's own backup includes it. */
const PROGRESS_KEY = 'courseProgress'
const INFO = { ...generated, python: '', anthropic: 'bundled' } as unknown as CourseInfo
const DEFAULT_LINES = 'What does the balance read?\nquit'

type Engine = 'starting' | 'ready' | 'failed'

/** The app's notes were written for the PC window; this rewords the parts that describe its layout. */
export function phoneNote(note: string): string {
  return note
    .replace(/\s*Run starts your program in the Output panel:[^.]*\./, '')
    .replace(/on the left/g, 'above')
    .replace(/provided below/g, 'provided (open "Already defined for you")')
    .replace(/in the file tabs above the editor/g, 'in the file tabs above the code')
    .trim()
}

function ask(request: CourseRequest, timeoutMs?: number): Promise<Record<string, unknown>> {
  return getRunner().course(request, curriculumFiles, timeoutMs)
}

/** Guided course on the phone: one column, with the same exercises, tests and progress rules as the PC. */
export default function Course() {
  const [progress, setProgress] = useState<Progress>(emptyProgress)
  const [loaded, setLoaded] = useState(false)
  const [engine, setEngine] = useState<Engine>('starting')
  const [engineProblem, setEngineProblem] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [busy, setBusy] = useState<'run' | 'check' | null>(null)
  const [tab, setTab] = useState<'output' | 'tests' | 'changes'>('tests')
  const [output, setOutput] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const [solutions, setSolutions] = useState<Record<string, string>>({})
  const [fileName, setFileName] = useState('main.py')
  const [jump, setJump] = useState('')
  const [copied, setCopied] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [typed, setTyped] = useState(DEFAULT_LINES)
  const [message, setMessage] = useState('')
  const busyRef = useRef<'run' | 'check' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)

  const id = exercise(progress.current) ? progress.current : START_ID
  const e = exercise(id) as CourseExercise
  const workspace = INFO.workspaces[id]
  const starting = startingPoint(id, INFO, progress, 'above')
  const locked = starting.locked
  const project = isMilestone(id)
  const state = exerciseState(progress, id, starting.files, starting.entry)
  const entry = workspace?.entry ?? 'main.py'
  const names = Object.keys(state.files)
  const preferred = firstFile(workspace)
  const file = names.includes(fileName) ? fileName : names.includes(preferred) ? preferred : names.includes(entry) ? entry : names[0]
  const status = statusOf(progress.exercises[id])
  const next = neighbour(id, 1)
  const previous = neighbour(id, -1)
  const solution = solutions[id]

  function setBusyBoth(value: 'run' | 'check' | null) {
    busyRef.current = value
    setBusy(value)
  }

  // Saved progress first; nothing is written back until it has been read.
  useEffect(() => {
    let alive = true
    getSetting<string | null>(PROGRESS_KEY, null)
      .then((json) => {
        if (!alive) return
        const saved = parseProgress(json)
        if (saved) setProgress(saved)
        setLoaded(true)
        setEditorKey((k) => k + 1)
      })
      .catch(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])

  // Python starts in the background, so the first Check does not wait for it.
  const startEngine = useCallback(() => {
    setEngine('starting')
    ask({ command: 'info' }, 180000).then((answer) => {
      if (answer.info) setEngine('ready')
      else {
        setEngine('failed')
        setEngineProblem(String(answer.problem ?? 'Python did not start.'))
      }
    })
  }, [])
  useEffect(startEngine, [startEngine])

  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => {
      setSetting(PROGRESS_KEY, JSON.stringify(progress)).catch(() => undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [progress, loaded])

  useEffect(() => {
    if (loaded && !locked && !progress.exercises[id]?.openedAt) setProgress((p) => openExercise(p, id, Date.now(), starting.files, starting.entry))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the starting files are derived from the values listed
  }, [loaded, id, locked, progress.exercises])

  function open(target: string) {
    if (busyRef.current) return
    setProgress((p) => {
      const from = startingPoint(target, INFO, p, 'above')
      return from.locked ? goTo(p, target) : openExercise(p, target, Date.now(), from.files, from.entry)
    })
    setOutput(null)
    setProblem('')
    setTab('tests')
    setShowMap(false)
    setFileName(firstFile(INFO.workspaces[target]))
    setEditorKey((k) => k + 1)
    top.current?.scrollIntoView({ block: 'start' })
  }

  async function start(kind: 'run' | 'check') {
    if (busyRef.current) return
    setBusyBoth(kind)
    setProblem('')
    const request = { exerciseId: id, files: state.files, explanation: state.explanation }
    if (kind === 'run') {
      setOutput(null)
      setTab('output')
      setProgress((p) => recordRun(p, id, Date.now()))
      const lines = workspace?.interactive ? typed.split('\n').filter((line) => line.trim() !== '') : undefined
      const answer = await ask({ command: 'run', ...request, input: lines }, 90000)
      if (typeof answer.output === 'string') setOutput(answer.output)
      else setProblem(String(answer.problem ?? 'The program could not be run.'))
    } else {
      setTab('tests')
      const answer = await ask({ command: 'check', ...request }, 150000)
      if (answer.report) setProgress((p) => recordCheck(p, id, answer.report as CheckReport, Date.now()))
      else setProblem(String(answer.problem ?? 'The check could not be run.'))
    }
    setBusyBoth(null)
    setEngine('ready')
    results.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  function reset() {
    const to = project && workspace?.previous ? `the code you passed ${workspace.previous} with` : 'its starter code'
    if (!window.confirm(`Reset ${id} to ${to}? Your attempt history is kept, and hints start again from the beginning.`)) return
    setProgress((p) => resetExercise(p, id, starting.files, starting.entry))
    setSolutions((s) => {
      const rest = { ...s }
      delete rest[id]
      return rest
    })
    setOutput(null)
    setEditorKey((k) => k + 1)
  }

  async function revealSolution() {
    if (!window.confirm('Show a reference solution? This exercise will then count as passed with help, not on your own, until you reset and solve it again.')) return
    setProgress((p) => showSolution(p, id))
    const answer = await ask({ command: 'solution', exerciseId: id })
    setSolutions((s) => ({ ...s, [id]: typeof answer.text === 'string' ? answer.text : `The solution could not be loaded: ${String(answer.problem ?? 'unknown problem')}` }))
  }

  async function unlockFromReference() {
    const before = workspace?.previous
    if (!before) return
    if (!window.confirm(`Start ${id} from a reference version of ${before} instead of your own code? ${id} will then count as passed with help. Your own ${before} work is not changed, and you can still go back and finish it.`)) return
    const answer = await ask({ command: 'solution', exerciseId: before })
    if (typeof answer.text !== 'string') {
      window.alert(`The reference version could not be loaded: ${String(answer.problem ?? 'unknown problem')}`)
      return
    }
    const text = answer.text
    setProgress((p) => startFromReference(p, id, { [entry]: carriedForward(text, id, 'above'), ...(workspace?.files ?? {}) }, entry, Date.now()))
    setEditorKey((k) => k + 1)
  }

  function copyContext() {
    navigator.clipboard
      ?.writeText(exerciseContext(id, state, output ?? ''))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }

  function restoreLastPass() {
    const files = state.lastPassedFiles
    if (!files) return
    setProgress((p) => Object.entries(files).reduce((acc, [name, text]) => setFile(acc, id, name, text), p))
    setEditorKey((k) => k + 1)
  }

  async function exportProgress() {
    try {
      await saveTextFile(`python-agent-course-progress-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(progress))
      setMessage('Progress file created. The PC app can read it with Import progress.')
    } catch (err) {
      setMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function importProgress(chosen: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (!chosen) return
    const imported = parseProgress(await chosen.text().catch(() => ''))
    if (!imported) {
      setMessage('That file is not a course progress export.')
      return
    }
    if (!window.confirm('Replace the course progress on this phone with the imported file?')) return
    setProgress(imported)
    setEditorKey((k) => k + 1)
    setMessage('Progress imported.')
  }

  const lower = useMemo(() => {
    if (problem) return <p className="notice bad">{problem}</p>
    if (tab === 'output') {
      if (busy === 'run') return <p className="muted">Running…</p>
      if (output === null) return <p className="muted">Run shows what your program prints, with the fixtures already defined.</p>
      return output ? <pre className="code output" data-testid="course-output">{output}</pre> : <p className="muted">The program ran and printed nothing.</p>
    }
    if (tab === 'changes') return <Changes before={state.startedFrom ?? ''} after={state.files[entry] ?? ''} since={workspace?.previous ? `your ${workspace.previous} code` : 'the starter'} />
    if (busy === 'check') return <p className="muted">{engine === 'starting' ? 'Starting Python, then checking… the first time takes a little while.' : 'Checking…'}</p>
    if (state.lastReport) return <TestReport report={state.lastReport} />
    return <p className="muted">Check tests runs your program against the task, including some edge cases.</p>
  }, [problem, tab, busy, output, state.startedFrom, state.files, state.lastReport, entry, workspace?.previous, engine])

  if (!loaded) return <section className="page"><p className="muted">Loading…</p></section>

  return (
    <section className="page course-page">
      <div ref={top} />
      <div className="row course-nav">
        <button className="quiet" onClick={() => previous && open(previous)} disabled={!previous || !!busy} aria-label="Previous exercise">
          ‹
        </button>
        <select value={id} onChange={(ev) => open(ev.target.value)} disabled={!!busy} aria-label="Exercise">
          {MODULES.map((m) => (
            <optgroup key={m.id} label={`${m.id}. ${m.name}`}>
              {EXERCISES.filter((x) => x.module === m.id).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id} {STATUS_MARK[statusOf(progress.exercises[x.id])]} {x.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="quiet" onClick={() => next && open(next)} disabled={!next || !!busy} aria-label="Next exercise">
          ›
        </button>
        <button className="quiet" onClick={() => setShowMap((v) => !v)}>
          {showMap ? 'Back' : 'All'}
        </button>
      </div>

      {engine === 'failed' && (
        <p className="notice warn">
          Python could not start on this phone, so Run and Check will not work yet: {engineProblem}{' '}
          <button className="linkish" onClick={startEngine}>
            Try again
          </button>
        </p>
      )}

      {showMap ? (
        <>
          <form
            className="row"
            onSubmit={(ev) => {
              ev.preventDefault()
              const target = parseExerciseId(jump)
              if (target) {
                open(target)
                setJump('')
              }
            }}
          >
            <input type="text" value={jump} onChange={(ev) => setJump(ev.target.value)} placeholder="Go to an exercise: type 4A, then Enter" aria-label="Go to exercise ID" spellCheck={false} />
          </form>
          <CourseMap
            progress={progress}
            info={INFO}
            onOpen={open}
            footer={
              <>
                <p className="muted small">Progress on this phone is separate from the PC. To move it across, export it here and import it there, or the other way round. The newest file replaces what is there.</p>
                <div className="row">
                  <button className="quiet" onClick={exportProgress}>
                    Export progress
                  </button>
                  <button className="quiet" onClick={() => fileInput.current?.click()}>
                    Import progress
                  </button>
                  <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(ev) => importProgress(ev.target.files?.[0])} />
                </div>
                {message && <p className="notice">{message}</p>}
              </>
            }
          />
        </>
      ) : (
        <div data-testid="course-prompt">
          <h1>
            <span className="ex-id">{e.id}</span> {e.title}
          </h1>
          <p className="chips">
            <StatusChip status={status} />
            <span className="chip">{onPriorityRoute(e.id) ? 'Core route' : 'Extra'}</span>
            <span className="chip">{e.mode}</span>
            {e.after && exercise(e.after) && (
              <button className="chip linkish" onClick={() => open(e.after as string)}>
                uses {e.after}
              </button>
            )}
          </p>
          {isDone(status) &&
            milestonesAfter(id)
              .filter((m) => !isDone(statusOf(progress.exercises[m])))
              .slice(0, 1)
              .map((m) => (
                <p key={m} className="notice">
                  Project step: put this into your own agent in{' '}
                  <button className="linkish" onClick={() => open(m)}>
                    {m} — {exercise(m)?.title}
                  </button>
                  .
                </p>
              ))}

          {e.brief && <BriefIntro brief={e.brief} />}
          {e.lesson && (
            <>
              <h2>The idea</h2>
              <div className="lesson">
                {e.lesson.map((paragraph, i) => (
                  <p key={i}>
                    <Inline text={paragraph} />
                  </p>
                ))}
              </div>
            </>
          )}

          <h2>Task</h2>
          <p className="task">
            <Inline text={e.task} />
          </p>
          {e.brief && <BriefDetail brief={e.brief} codeWhere="Their code is under Already defined for you, just below." />}
          {e.mode === 'mock' && <p className="app-note">The timed projects are multi-file and timed. They work here, but they are better done on the PC.</p>}
          {workspace?.note && (
            <p className="app-note">
              <Inline text={phoneNote(workspace.note)} />
            </p>
          )}

          {(e.fixtures.length > 0 || workspace?.extra_fixtures) && (
            <details className="why">
              <summary>Already defined for you ({e.fixtures.length + Object.keys(workspace?.extra_fixtures ?? {}).length})</summary>
              {e.fixtures.map((name) => (
                <div key={name}>
                  <code>{name}</code>
                  <pre className="code">{FIXTURES[name]}</pre>
                </div>
              ))}
              {Object.entries(workspace?.extra_fixtures ?? {}).map(([name, source]) => (
                <div key={name}>
                  <code>{name}</code> <span className="muted small">(provided by this app)</span>
                  <pre className="code">{source}</pre>
                </div>
              ))}
              <p className="muted small">These run before your code, exactly as shown. Nothing here contacts Anthropic: the responses are built on the phone.</p>
            </details>
          )}

          {workspace?.explanation && (
            <>
              <h2>Your explanation</h2>
              <textarea rows={4} value={state.explanation} onChange={(ev) => setProgress((p) => setExplanation(p, id, ev.target.value))} placeholder="Write a sentence or two in your own words." />
            </>
          )}

          {locked ? (
            <div className="notice" data-testid="locked">
              <strong>{id} starts from your own code</strong>
              <p>
                This milestone opens with the program you passed {workspace?.previous} with, so the agent stays yours. {workspace?.previous} has not been passed on this phone yet. If you passed it on the PC, import your PC progress from the All screen.
              </p>
              <div className="row">
                <button className="primary" onClick={() => workspace?.previous && open(workspace.previous)}>
                  Open {workspace?.previous}
                </button>
                <button className="quiet" onClick={unlockFromReference}>
                  Start from a reference version
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2>Your code</h2>
              {names.length > 1 && (
                <div className="row files" role="tablist">
                  {names.map((name) => (
                    <button key={name} role="tab" aria-selected={name === file} className={name === file ? 'file active' : 'file'} onClick={() => setFileName(name)}>
                      {name}
                      {workspace?.readonly?.includes(name) ? ' (read only)' : ''}
                    </button>
                  ))}
                </div>
              )}
              <CodeEditor
                key={`${id}-${file}-${editorKey}`}
                value={state.files[file] ?? ''}
                onChange={(text) => setProgress((p) => setFile(p, id, file, text))}
                minHeight="200px"
                readOnly={!!workspace?.readonly?.includes(file)}
                showKeys={!workspace?.readonly?.includes(file)}
              />
              {workspace?.interactive && (
                <>
                  <label htmlFor="typed-lines" className="small muted">
                    What you would type to your program, one line per turn. Run feeds these in, then ends.
                  </label>
                  <textarea id="typed-lines" className="mono" rows={3} value={typed} onChange={(ev) => setTyped(ev.target.value)} spellCheck={false} />
                </>
              )}
              <div className="row course-bar">
                {busy ? (
                  <button className="quiet" onClick={() => getRunner().stop()}>
                    Stop
                  </button>
                ) : (
                  <button className="primary" onClick={() => start('run')}>
                    {entry === 'main.py' ? 'Run' : `Run ${entry}`}
                  </button>
                )}
                <button className="primary alt" onClick={() => start('check')} disabled={!!busy}>
                  {busy === 'check' ? 'Checking…' : 'Check tests'}
                </button>
                <button className="quiet" onClick={reset} disabled={!!busy}>
                  Reset
                </button>
                <button className={state.lastReport?.ok ? 'primary' : 'quiet'} onClick={() => next && open(next)} disabled={!next || !!busy}>
                  Next ›
                </button>
              </div>
              {workspace?.live && <p className="muted small">Run here always uses the simulated Claude. Run live, with the real Claude, is on the PC.</p>}
              <div className="row tabs-row" role="tablist" ref={results}>
                <button role="tab" aria-selected={tab === 'tests'} className={tab === 'tests' ? 'file active' : 'file'} onClick={() => setTab('tests')}>
                  Tests{state.lastReport && !state.lastReport.syntaxError ? ` (${state.lastReport.passed}/${state.lastReport.total})` : ''}
                </button>
                <button role="tab" aria-selected={tab === 'output'} className={tab === 'output' ? 'file active' : 'file'} onClick={() => setTab('output')}>
                  Output
                </button>
                {project && (
                  <button role="tab" aria-selected={tab === 'changes'} className={tab === 'changes' ? 'file active' : 'file'} onClick={() => setTab('changes')}>
                    Changes
                  </button>
                )}
              </div>
              <div className="course-results" aria-live="polite">
                {lower}
              </div>
            </>
          )}

          <h2>Hints</h2>
          {e.hints.slice(0, state.hints).map((hint, i) => (
            <p key={i} className="hint">
              <strong>Hint {i + 1}.</strong> <Inline text={hint} />
            </p>
          ))}
          {locked ? null : state.hints < e.hints.length ? (
            <button className="quiet" onClick={() => setProgress((p) => showHint(p, id, state.hints + 1))}>
              Show hint {state.hints + 1} of {e.hints.length}
            </button>
          ) : (
            <p className="muted small">That was the last hint.</p>
          )}

          <details className="why">
            <summary>Why this matters for agents</summary>
            <p>{WHY[e.id]}</p>
            <p className="muted small">Ideas: {e.concepts.join(', ')}</p>
          </details>
          <details className="why">
            <summary>What the tests look for</summary>
            <ul>
              {e.tests.map((t) => (
                <li key={t}>
                  <Inline text={t} />
                </li>
              ))}
            </ul>
          </details>
          {!locked && (
            <details className="why" open={!!solution}>
              <summary>Explain solution</summary>
              {solution ? (
                <pre className="code">{solution}</pre>
              ) : (
                <>
                  <p className="muted small">Shown only if you ask. Try the hints first; other correct programs pass the tests too.</p>
                  <button className="quiet" onClick={revealSolution} disabled={project && !state.attempts.some((a) => a.kind === 'check')}>
                    Show a reference solution
                  </button>
                  {project && !state.attempts.some((a) => a.kind === 'check') && <p className="muted small">Available after you have checked an attempt of your own.</p>}
                </>
              )}
            </details>
          )}

          {!locked && (
            <div className="row course-actions">
              <button className="quiet" onClick={copyContext}>
                {copied ? 'Copied' : 'Copy exercise context'}
              </button>
              {state.markedDone ? (
                <button className="quiet" onClick={() => setProgress((p) => unmarkDone(p, id))}>
                  Remove "marked done"
                </button>
              ) : (
                !isDone(status) && (
                  <button className="quiet" onClick={() => setProgress((p) => markDone(p, id, Date.now()))}>
                    Mark done (mentor)
                  </button>
                )
              )}
              {state.lastPassedFiles && (
                <button className="quiet" onClick={restoreLastPass}>
                  Load my last passing code
                </button>
              )}
            </div>
          )}
          <p className="muted small">
            {state.attempts.length} attempt{state.attempts.length === 1 ? '' : 's'} saved on this phone
          </p>
        </div>
      )}
    </section>
  )
}
