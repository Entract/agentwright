import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import CodeEditor from '../components/CodeEditor'
import { exerciseContext } from '../course/context'
import {
  EXERCISES, FIXTURES, MODULES, START_ID, exercise, isMilestone, milestonesAfter, neighbour, onPriorityRoute, parseExerciseId, prerequisite, type CourseExercise,
} from '../course/manifest'
import {
  carriedForward, emptyProgress, exerciseState, goTo, isDone, markDone, openExercise, parseProgress, recordCheck, recordRun,
  resetExercise, setExplanation, setFile, showHint, showSolution, startFromReference, statusOf, timeToFirstPass, unmarkDone,
  type CheckReport, type Progress,
} from '../course/progress'
import { BriefDetail, BriefIntro, Changes, CourseMap, Inline, STATUS_MARK, StatusChip, TestReport, firstFile, startingPoint } from '../course/parts'
import { WHY } from '../course/why'
import { useDivider } from './Divider'
import { hasHost, onHostMessage, sendToHost, type CourseInfo } from './host'
import { PcOutput, addChunk, type PcRun } from './PcOutput'

const LOCAL_KEY = 'course-progress'
/** Run ids for the course start here so they can never be confused with scratchpad runs. */
const RUN_ID_BASE = 1_000_000


/** A 55-minute countdown for the timed projects. It only informs; nothing is locked when it ends. */
function MockTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (endsAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [endsAt])
  if (endsAt === null) {
    return (
      <button className="quiet" onClick={() => { setNow(Date.now()); setEndsAt(Date.now() + 55 * 60 * 1000) }}>
        Start the 55-minute timer
      </button>
    )
  }
  const left = Math.max(0, Math.round((endsAt - now) / 1000))
  return (
    <p className={left === 0 ? 'course-fail' : 'muted'}>
      {left === 0 ? 'Time is up. Finish your sentence, then note what you would do next.' : `Time left: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}{' '}
      <button className="linkish" onClick={() => setEndsAt(null)}>
        reset
      </button>
    </p>
  )
}


/** Guided course: the task stays visible on the left while the code is edited, run and checked on the right. */
export default function Guided({ active }: { active: boolean }) {
  const [info, setInfo] = useState<CourseInfo | null>(null)
  const [problem, setProblem] = useState('')
  const [progress, setProgress] = useState<Progress>(emptyProgress)
  const [loaded, setLoaded] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [run, setRun] = useState<PcRun | null>(null)
  const [busy, setBusy] = useState<'run' | 'check' | null>(null)
  const [tab, setTab] = useState<'output' | 'tests' | 'changes'>('tests')
  const split = useDivider('course-divider')
  const [checkProblem, setCheckProblem] = useState('')
  const [solutions, setSolutions] = useState<Record<string, string>>({})
  const [fileName, setFileName] = useState('main.py')
  const [jump, setJump] = useState('')
  const [copied, setCopied] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const runId = useRef(RUN_ID_BASE)
  const busyRef = useRef<'run' | 'check' | null>(null)
  const requested = useRef(false)
  /** A locked milestone being opened from a reference version: which one, and from which earlier milestone. */
  const unlocking = useRef<{ id: string; previous: string } | null>(null)
  const infoRef = useRef<CourseInfo | null>(null)
  infoRef.current = info

  const id = exercise(progress.current) ? progress.current : START_ID
  const e = exercise(id) as CourseExercise
  const workspace = info?.workspaces[id]
  const starting = startingPoint(id, info, progress)
  const locked = starting.locked
  const project = isMilestone(id)
  const state = exerciseState(progress, id, starting.files, starting.entry)
  const entry = workspace?.entry ?? 'main.py'
  const names = Object.keys(state.files)
  const preferred = firstFile(workspace)
  const file = names.includes(fileName) ? fileName : names.includes(preferred) ? preferred : names.includes(entry) ? entry : names[0]
  const status = statusOf(progress.exercises[id])
  const ready = !!info && info.implemented.includes(id)
  const needsSdk = e.fixtures.some((f) => (FIXTURES[f] ?? '').includes('anthropic'))
  const stateRef = useRef(state)
  stateRef.current = state
  const idRef = useRef(id)
  idRef.current = id

  function setBusyBoth(value: 'run' | 'check' | null) {
    busyRef.current = value
    setBusy(value)
  }

  const open = useCallback(
    (next: string) => {
      if (busyRef.current) return
      const ws = info?.workspaces[next]
      setProgress((p) => {
        const from = startingPoint(next, info, p)
        return from.locked ? goTo(p, next) : openExercise(p, next, Date.now(), from.files, from.entry)
      })
      setRun(null)
      setCheckProblem('')
      setTab('tests')
      setShowMap(false)
      setFileName(firstFile(ws))
      setEditorKey((k) => k + 1)
    },
    [info],
  )

  // Load the course description and saved progress when the course is first shown.
  useEffect(() => {
    const off = onHostMessage((m) => {
      if (m.type === 'course') {
        if (m.info) setInfo(m.info)
        setProblem(m.problem ?? '')
        const saved = parseProgress(m.progress)
        if (saved) setProgress(saved)
        setLoaded(true)
        setEditorKey((k) => k + 1)
      } else if (m.type === 'out' && m.id === runId.current && busyRef.current === 'run') {
        setRun((r) => (r ? addChunk(r, m.stream, m.text) : r))
      } else if (m.type === 'exit' && m.id === runId.current && busyRef.current === 'run') {
        setRun((r) => ({ ...(r ?? { chunks: [], size: 0, truncated: false }), done: { code: m.code, stopped: m.stopped, ms: m.ms, problem: m.problem } }))
        setBusyBoth(null)
      } else if (m.type === 'checked' && m.id === runId.current) {
        if (m.report) {
          const report = m.report as CheckReport
          setProgress((p) => recordCheck(p, m.exerciseId, report, Date.now()))
          setCheckProblem('')
        } else {
          setCheckProblem(m.problem ?? 'The check could not be run.')
        }
        setTab('tests')
        setBusyBoth(null)
      } else if (m.type === 'solution' && unlocking.current?.previous === m.exerciseId) {
        // A reference version of the previous milestone, asked for on purpose to unlock this one.
        const { id: target } = unlocking.current
        unlocking.current = null
        const ws = infoRef.current?.workspaces[target]
        if (m.text && ws) {
          const entry = ws.entry ?? 'main.py'
          setProgress((p) => startFromReference(p, target, { [entry]: carriedForward(m.text ?? '', target), ...(ws.files ?? {}) }, entry, Date.now()))
          setEditorKey((k) => k + 1)
        } else {
          window.alert(`The reference version could not be loaded: ${m.problem ?? 'unknown problem'}`)
        }
      } else if (m.type === 'solution') {
        setSolutions((s) => ({ ...s, [m.exerciseId]: m.text ?? `The solution could not be loaded: ${m.problem ?? 'unknown problem'}` }))
      } else if (m.type === 'progress') {
        const imported = parseProgress(m.json)
        if (imported && window.confirm('Replace your current course progress with the imported file?')) {
          setProgress(imported)
          setEditorKey((k) => k + 1)
        } else if (!imported) window.alert('That file is not a course progress export.')
      }
    })
    return off
  }, [])

  useEffect(() => {
    if (!active || requested.current) return
    requested.current = true
    if (hasHost()) {
      sendToHost({ type: 'course' })
      sendToHost({ type: 'size', width: 1180, height: 760 })
    } else {
      let saved: Progress | null = null
      try {
        saved = parseProgress(localStorage.getItem(LOCAL_KEY))
      } catch {
        saved = null
      }
      if (saved) setProgress(saved)
      setProblem('Running and checking exercises needs the Python Scratchpad app on the PC. In a browser you can read the exercises only.')
      setLoaded(true)
    }
  }, [active])

  // Save shortly after every change, once the saved state has been loaded (never before, or it would be overwritten).
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => {
      const json = JSON.stringify(progress)
      if (hasHost()) sendToHost({ type: 'courseSave', json })
      else {
        try {
          localStorage.setItem(LOCAL_KEY, json)
        } catch {
          // Not saved in this browser.
        }
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [progress, loaded])

  // Record the first time this exercise is opened.
  useEffect(() => {
    if (loaded && active && !locked && !progress.exercises[id]?.openedAt) setProgress((p) => openExercise(p, id, Date.now(), starting.files, starting.entry))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the starting files are derived from the values listed
  }, [loaded, active, id, locked, progress.exercises, workspace])

  const start = useCallback((kind: 'run' | 'check', live = false) => {
    if (busyRef.current || !hasHost()) return
    if (live && !window.confirm('Run live?\n\nThis starts your agent with the real Claude instead of the simulation. What you type, your rules and your tool results are sent to Anthropic using the API key saved in this app, and each request costs a small amount.\n\nYour tools are still the simulated instruments in your program.')) return
    const current = stateRef.current
    const requestId = ++runId.current
    setBusyBoth(kind)
    if (kind === 'run') {
      setRun({ chunks: [], size: 0, truncated: false, done: null })
      setTab('output')
      setProgress((p) => recordRun(p, idRef.current, Date.now()))
      sendToHost({ type: 'courseRun', id: requestId, exerciseId: idRef.current, files: current.files, explanation: current.explanation, live })
    } else {
      setCheckProblem('')
      sendToHost({ type: 'courseCheck', id: requestId, exerciseId: idRef.current, files: current.files, explanation: current.explanation })
    }
  }, [])

  // Ctrl+Enter runs, Ctrl+Shift+Enter checks, while the course is the visible mode.
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        event.stopPropagation()
        start(event.shiftKey ? 'check' : 'run')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, start])

  const consoleText = useMemo(() => (run ? run.chunks.map((c) => c.text).join('') : ''), [run])
  const next = neighbour(id, 1)
  const previous = neighbour(id, -1)
  const before = prerequisite(id)
  const solution = solutions[id]
  const firstPass = timeToFirstPass(progress.exercises[id])

  function reset() {
    const to = project && workspace?.previous ? `the code you passed ${workspace.previous} with` : 'its starter code'
    if (!window.confirm(`Reset ${id} to ${to}? Your attempt history is kept, and hints start again from the beginning.`)) return
    setProgress((p) => resetExercise(p, id, starting.files, starting.entry))
    setSolutions((s) => {
      const rest = { ...s }
      delete rest[id]
      return rest
    })
    setRun(null)
    setEditorKey((k) => k + 1)
  }

  function revealSolution() {
    if (!window.confirm('Show a reference solution? This exercise will then count as passed with help, not on your own, until you reset and solve it again.')) return
    setProgress((p) => showSolution(p, id))
    sendToHost({ type: 'courseSolution', exerciseId: id })
  }

  function copyContext() {
    navigator.clipboard
      ?.writeText(exerciseContext(id, state, consoleText))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }

  function typeIntoProgram(text: string) {
    sendToHost({ type: 'stdin', text })
    setRun((r) => (r ? addChunk(r, 'in', text + '\n') : r))
  }

  function unlockFromReference() {
    const previous = workspace?.previous
    if (!previous || !hasHost()) return
    if (!window.confirm(`Start ${id} from a reference version of ${previous} instead of your own code? ${id} will then count as passed with help. Your own ${previous} work is not changed, and you can still go back and finish it.`)) return
    unlocking.current = { id, previous }
    sendToHost({ type: 'courseSolution', exerciseId: previous })
  }

  function restoreLastPass() {
    const files = state.lastPassedFiles
    if (!files) return
    setProgress((p) => Object.entries(files).reduce((acc, [name, text]) => setFile(acc, id, name, text), p))
    setEditorKey((k) => k + 1)
  }

  let lower: ReactNode
  if (tab === 'output') {
    const idle = workspace?.interactive ? 'Run starts your program here. Type in the box that appears and press Enter to talk to it; type quit to end it. Ctrl+Enter.' : 'Run shows what your program prints, with the fixtures already defined. Ctrl+Enter.'
    lower = run ? <PcOutput run={run} onInput={typeIntoProgram} quiet={!workspace?.interactive} /> : <p className="muted">{idle}</p>
  } else if (tab === 'changes') {
    lower = <Changes before={state.startedFrom ?? ''} after={state.files[entry] ?? ''} since={workspace?.previous ? `your ${workspace.previous} code` : 'the starter'} />
  } else if (checkProblem) {
    lower = <p className="notice bad">{checkProblem}</p>
  } else if (busy === 'check') {
    lower = <p className="muted">Checking…</p>
  } else if (state.lastReport) {
    lower = <TestReport report={state.lastReport} />
  } else {
    lower = <p className="muted">{ready ? 'Check tests runs your program against the task, including some edge cases. Ctrl+Shift+Enter.' : 'The tests for this exercise are not built yet. You can still write and run code here.'}</p>
  }

  return (
    <div className="guided">
      <aside className="prompt" aria-label="Exercise">
        <div className="row prompt-nav">
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
            {showMap ? 'Back to task' : 'All'}
          </button>
        </div>
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
          <input type="text" className="jump" value={jump} onChange={(ev) => setJump(ev.target.value)} placeholder="Go to an exercise: type 4A and press Enter" aria-label="Go to exercise ID" spellCheck={false} />
        </form>

        {problem && <p className="notice warn">{problem}</p>}
        {info && needsSdk && !info.anthropic && (
          <p className="notice warn">
            This exercise uses the anthropic library, which is not installed for the PC's Python. In a terminal run <code>pip install anthropic</code>, then reopen the scratchpad.
          </p>
        )}

        {showMap ? (
          <CourseMap
            progress={progress}
            info={info}
            onOpen={open}
            footer={
              hasHost() && (
                <div className="row">
                  <button className="quiet" onClick={() => sendToHost({ type: 'courseExport' })}>
                    Export progress…
                  </button>
                  <button className="quiet" onClick={() => sendToHost({ type: 'courseImport' })}>
                    Import progress…
                  </button>
                </div>
              )
            }
          />
        ) : (
          <div className="prompt-body" data-testid="course-prompt">
            <h1>
              <span className="ex-id">{e.id}</span> {e.title}
            </h1>
            <p className="chips">
              <StatusChip status={status} />
              <span className="chip">{onPriorityRoute(e.id) ? 'Core route' : 'Extra'}</span>
              <span className="chip">{e.mode}</span>
              {before && (
                <button className="chip linkish" onClick={() => open(before)} title="Open the exercise this one builds on">
                  builds on {before}
                </button>
              )}
              {e.after && exercise(e.after) && (
                <button className="chip linkish" onClick={() => open(e.after as string)} title="The numbered exercise that teaches what this milestone uses">
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
            {e.mode === 'mock' && <MockTimer key={id} />}
            {e.brief && <BriefDetail brief={e.brief} codeWhere="Their code is under Already defined for you, further down." />}
            {workspace?.note && (
              <p className="app-note">
                <Inline text={workspace.note} />
              </p>
            )}

            {workspace?.explanation && (
              <>
                <h2>Your explanation</h2>
                <textarea
                  className="explain"
                  rows={4}
                  value={state.explanation}
                  onChange={(ev) => setProgress((p) => setExplanation(p, id, ev.target.value))}
                  placeholder="Write a sentence or two in your own words. It is saved and included when you copy the exercise context."
                />
              </>
            )}

            <h2>Already defined for you</h2>
            {e.fixtures.length === 0 && !workspace?.extra_fixtures ? (
              <p className="muted">{project ? 'Nothing is defined for you: everything in the program is in the editor.' : 'Nothing: this exercise starts from your own code.'}</p>
            ) : (
              e.fixtures.map((name) => (
                <details key={name} open={e.fixtures.length <= 2} className="fixture">
                  <summary>
                    <code>{name}</code>
                  </summary>
                  <pre className="code">{FIXTURES[name]}</pre>
                </details>
              ))
            )}
            {Object.entries(workspace?.extra_fixtures ?? {}).map(([name, source]) => (
              <details key={name} open className="fixture">
                <summary>
                  <code>{name}</code> <span className="muted small">(provided by this app)</span>
                </summary>
                <pre className="code">{source}</pre>
              </details>
            ))}
            {!project && <p className="muted small">These run before your code, exactly as shown. Nothing here contacts Anthropic: the responses are built locally.</p>}

            <h2>Hints</h2>
            {e.hints.slice(0, state.hints).map((hint, i) => (
              <p key={i} className="hint">
                <strong>Hint {i + 1}.</strong> <Inline text={hint} />
              </p>
            ))}
            {state.hints < e.hints.length ? (
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

            <details className="why" open={!!solution}>
              <summary>Explain solution</summary>
              {solution ? (
                <pre className="code">{solution}</pre>
              ) : (
                <>
                  <p className="muted small">Shown only if you ask. Try the hints first; other correct programs pass the tests too.</p>
                  <button className="quiet" onClick={revealSolution} disabled={!hasHost() || (project && !state.attempts.some((a) => a.kind === 'check'))} title={project ? 'Available after you have checked an attempt of your own' : undefined}>
                    Show a reference solution
                  </button>
                </>
              )}
            </details>

            <div className="row prompt-actions">
              <button className="quiet" onClick={copyContext}>
                {copied ? 'Copied' : 'Copy exercise context'}
              </button>
              {state.markedDone ? (
                <button className="quiet" onClick={() => setProgress((p) => unmarkDone(p, id))}>
                  Remove "marked done"
                </button>
              ) : (
                !isDone(status) && (
                  <button className="quiet" onClick={() => setProgress((p) => markDone(p, id, Date.now()))} title="For when your mentor says: mark this one done">
                    Mark done (mentor)
                  </button>
                )
              )}
              {state.lastPassedFiles && (
                <button className="quiet" onClick={restoreLastPass} title="Put your most recent passing code back in the editor">
                  Load my last passing code
                </button>
              )}
            </div>
            <p className="muted small">
              {state.attempts.length} attempt{state.attempts.length === 1 ? '' : 's'} saved
              {firstPass !== null ? ` · first pass after ${Math.max(1, Math.round(firstPass / 60000))} min` : ''}
            </p>
          </div>
        )}
      </aside>

      <section className="work" aria-label="Your code" hidden={!locked}>
        <div className="locked" data-testid="locked">
          <h2>{id} starts from your own code</h2>
          <p>
            This milestone opens with the program you passed <strong>{workspace?.previous}</strong> with, so that the agent stays yours. You have not passed {workspace?.previous} yet.
          </p>
          <p>
            <button className="primary" onClick={() => workspace?.previous && open(workspace.previous)}>
              Open {workspace?.previous}
            </button>
          </p>
          <p className="muted small">
            If you would rather move on, you can start {id} from a reference version of {workspace?.previous}. It will count as passed with help.
          </p>
          <p>
            <button className="quiet" onClick={unlockFromReference} disabled={!hasHost()}>
              Start from a reference version
            </button>
          </p>
        </div>
      </section>

      <section className="work" aria-label="Your code" hidden={locked}>
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
        <div className="work-editor" style={split.upper}>
          <CodeEditor key={`${id}-${file}-${editorKey}`} value={state.files[file] ?? ''} onChange={(text) => setProgress((p) => setFile(p, id, file, text))} showKeys={false} fill readOnly={!!workspace?.readonly?.includes(file)} />
        </div>
        {split.divider}
        <div className="row pad-bar">
          {busy === 'run' ? (
            <button className="primary" onClick={() => sendToHost({ type: 'stop' })}>
              Stop
            </button>
          ) : (
            <button className="primary" onClick={() => start('run')} disabled={!!busy || !hasHost()} title="Ctrl+Enter">
              {entry === 'main.py' ? 'Run' : `Run ${entry}`}
            </button>
          )}
          {workspace?.live && busy !== 'run' && (
            <button className="quiet live" onClick={() => start('run', true)} disabled={!!busy || !hasHost()} title="Runs your agent with the real Claude. Asks first; uses your saved key.">
              Run live…
            </button>
          )}
          <button className="primary alt" onClick={() => start('check')} disabled={!!busy || !ready} title="Ctrl+Shift+Enter">
            {busy === 'check' ? 'Checking…' : 'Check tests'}
          </button>
          <span className="pad-space" />
          <button className="quiet" onClick={reset} disabled={!!busy}>
            Reset
          </button>
          <button className={state.lastReport?.ok ? 'primary' : 'quiet'} onClick={() => next && open(next)} disabled={!next || !!busy}>
            Next ›
          </button>
        </div>
        <div className="row tabs-row" role="tablist">
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
        <div className="work-output" style={split.lower} aria-live="polite">
          {lower}
        </div>
      </section>
    </div>
  )
}
