// The Revision section, shared by the PC window and the phone app. Sets written by a mentor are
// pasted or imported, then practised; a missed question comes back first.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor'
import { useDivider } from '../desktop/Divider'
import { PcOutput, addChunk, emptyPcRun, type PcRun } from '../desktop/PcOutput'
import { hasHost, hostKind, onHostMessage, sendToHost, type HostInfo } from '../desktop/host'
import { getRunner } from '../runner/client'
import { needsNetwork, type RunRequest, type RunResult } from '../runner/core'
import {
  MENTOR_INSTRUCTIONS, PC_MARK, addSet, dueNow, emptyStore, needsPerson, parseSet, parseStore, pcCheckScript, readPcCheck, record, removeSet, sameOutput, selfJudged, setSummary, wholeSet, writeRun,
  type PcTest, type Pick, type Question, type RevisionSet, type Store,
} from './format'
import Mentor from './Mentor'
import { saveAsAgent } from '../agents/store'
import { readMarks, type Mark } from './mentorText'
import Confetti from './Confetti'
import './revision.css'

export interface RevisionStorage {
  load(): Promise<string | null>
  save(text: string): Promise<void>
}

interface Props {
  storage: RevisionStorage
  saveFile: (name: string, text: string) => Promise<void> | void
  /** The symbol-key row above the phone keyboard. */
  phoneKeys?: boolean
  /** PC window: a code question gets the scratchpad's layout, with the question in a side panel. */
  wide?: boolean
}

const SESSION_SIZE = 20
const RUN_TIMEOUT = 15000
const PYTHON_KEY = 'revision-python'
const SIDE_KEY = 'revision-side'
const MENTOR_KEY = 'revision-mentor'
/** Run numbers for the PC's Python. The scratchpad and the course count in their own ranges. */
let pcRunNumber = 2_000_000

type PythonChoice = 'builtin' | 'pc'

function savedPython(): PythonChoice {
  try {
    return localStorage.getItem(PYTHON_KEY) === 'pc' ? 'pc' : 'builtin'
  } catch {
    return 'builtin'
  }
}

/** Runs each question's own code once, so that a faulty question is flagged before it wastes the learner's time. */
export async function findFaults(questions: Question[], run: (request: RunRequest) => Promise<RunResult>): Promise<Record<number, string>> {
  const faults: Record<number, string> = {}
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    // Code that calls Claude or waits for typing cannot be tried unattended.
    if (needsPerson(q) || selfJudged(q)) continue
    if (q.type === 'write') {
      const request = writeRun(q, q.solution)
      const result = await run({ code: request.code, tests: request.tests, timeoutMs: RUN_TIMEOUT })
      const failed = result.tests.filter((t) => !t.passed)
      if (result.error) faults[i] = `Its own solution stops with ${result.error.type}: ${result.error.message}`
      else if (failed.length) faults[i] = `Its own solution fails its test ${failed[0].name}${failed[0].message ? ` (${failed[0].message})` : ''}`
    } else if (q.type === 'predict') {
      const result = await run({ code: q.code, timeoutMs: RUN_TIMEOUT })
      if (result.error && (result.error.kind === 'timeout' || result.error.kind === 'internal' || result.error.kind === 'syntax')) faults[i] = `Its code cannot be run: ${result.error.type}: ${result.error.message}`
    }
  }
  return faults
}

function errorLine(result: RunResult, setupLines = 0): string {
  const e = result.error
  if (!e) return ''
  const line = e.line !== null && e.line > setupLines ? ` on line ${e.line - setupLines}` : ''
  return `${e.type}${line}: ${e.message}`
}

type Phase = 'asking' | 'right' | 'wrong'

function QuestionCard({ pick, fault, phoneKeys, wide, host, onDone }: { pick: Pick; fault?: string; phoneKeys: boolean; wide: boolean; host: HostInfo | null; onDone: (correct: boolean | null) => void }) {
  const q = pick.question
  const [phase, setPhase] = useState<Phase>('asking')
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState(q.type === 'write' ? (q.starter ?? '') : '')
  const [chosen, setChosen] = useState<number | null>(null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [checked, setChecked] = useState(false)
  const [truth, setTruth] = useState<string | null>(null)
  const [solutionShown, setSolutionShown] = useState(false)
  // On the PC a write question can also run with the PC's Python, as in the scratchpad.
  const live = needsPerson(q)
  const judged = selfJudged(q)
  const [ticked, setTicked] = useState<Record<number, boolean>>({})
  const [python, setPython] = useState<PythonChoice>(() => (hostKind() === 'phone' && q.type === 'write' ? 'pc' : hasHost() && (live || savedPython() === 'pc') ? 'pc' : 'builtin'))
  const [pcRun, setPcRun] = useState<PcRun | null>(null)
  const [pcTests, setPcTests] = useState<PcTest[] | null>(null)
  const [pcNote, setPcNote] = useState('')
  const pc = useRef({ id: 0, printed: '', hidden: false, checking: false, solutionShown: false })
  pc.current.solutionShown = solutionShown

  useEffect(() => {
    if (q.type !== 'write' || !hasHost()) return
    const off = onHostMessage((m) => {
      const state = pc.current
      if (state.id === 0 || !('id' in m) || m.id !== state.id) return
      if (m.type === 'out') {
        let text = m.text
        if (m.stream === 'out') {
          state.printed += text
          if (state.hidden) return
          const at = text.indexOf(PC_MARK)
          if (at >= 0) {
            state.hidden = true
            text = text.slice(0, at)
          }
          if (!text) return
        }
        setPcRun((r) => (r ? addChunk(r, m.stream, text) : r))
      } else if (m.type === 'exit') {
        state.id = 0
        setBusy(false)
        setPcRun((r) => ({ ...(r ?? emptyPcRun()), done: { code: m.code, stopped: m.stopped, ms: m.ms, problem: m.problem } }))
        if (!state.checking || m.problem || m.stopped) return
        const tests = m.code ? null : readPcCheck(q, state.printed)
        setPcTests(tests)
        if (!tests) setPcNote('The tests did not run, because the program stopped with an error first. The error is shown above.')
        else if (tests.every((t) => t.passed)) setPhase(state.solutionShown ? 'wrong' : 'right')
      }
    })
    return () => {
      off()
      if (pc.current.id !== 0) sendToHost({ type: 'stop' })
    }
  }, [q])

  function choosePython(next: PythonChoice) {
    if (busy) return
    setPython(next)
    try {
      localStorage.setItem(PYTHON_KEY, next)
    } catch {
      // Not remembered; the choice still holds for this question.
    }
  }

  const next = (correct: boolean | null) => onDone(correct)

  async function checkPredict() {
    if (q.type !== 'predict') return
    setBusy(true)
    const run = await getRunner().run({ code: q.code, timeoutMs: RUN_TIMEOUT })
    setBusy(false)
    if (run.error) {
      // The right prediction is the error: naming its type is enough.
      setTruth(`${run.stdout}${run.error.type}: ${run.error.message}`)
      setPhase(typed.toLowerCase().includes(run.error.type.toLowerCase()) ? 'right' : 'wrong')
    } else {
      setTruth(run.stdout)
      setPhase(sameOutput(typed, run.stdout) ? 'right' : 'wrong')
    }
  }

  async function runWrite(withTests: boolean) {
    if (q.type !== 'write') return
    setBusy(true)
    const request = writeRun(q, code)
    if (python === 'pc') {
      const id = ++pcRunNumber
      pc.current = { ...pc.current, id, printed: '', hidden: false, checking: withTests }
      setResult(null)
      setPcTests(null)
      setPcNote('')
      setPcRun(emptyPcRun())
      sendToHost({ type: 'run', id, code: withTests ? pcCheckScript(q, code) : request.code })
      return // finished by the host's "exit" message
    }
    setPcRun(null)
    setPcTests(null)
    setPcNote('')
    const run = await getRunner().run({ code: request.code, tests: withTests ? request.tests : undefined, timeoutMs: RUN_TIMEOUT })
    setBusy(false)
    setResult(run)
    setChecked(withTests)
    if (withTests && !run.error && run.tests.every((t) => t.passed)) setPhase(solutionShown ? 'wrong' : 'right')
  }

  const setupLines = q.type === 'write' ? writeRun(q, '').setupLines : 0
  const bench = wide && q.type === 'write'
  // On the phone the two side panels slide over the editor instead of sitting beside it.
  const phone = hostKind() === 'phone'
  const split = useDivider('revision-divider')
  const [sideOpen, setSideOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDE_KEY) !== 'closed'
    } catch {
      return true
    }
  })
  function showSide(open: boolean) {
    setSideOpen(open)
    if (open && phone) setMentorOpen(false)
    try {
      localStorage.setItem(SIDE_KEY, open ? 'open' : 'closed')
    } catch {
      // Not remembered.
    }
  }
  const [mentorOpen, setMentorOpen] = useState(() => {
    try {
      return localStorage.getItem(MENTOR_KEY) === 'open'
    } catch {
      return false
    }
  })
  function showMentor(open: boolean) {
    setMentorOpen(open)
    if (open && phone) setSideOpen(false)
    try {
      localStorage.setItem(MENTOR_KEY, open ? 'open' : 'closed')
    } catch {
      // Not remembered.
    }
  }
  const [judgeRequest, setJudgeRequest] = useState(0)
  const [mentorVerdict, setMentorVerdict] = useState<'done' | 'not yet' | 'test more' | 'asked' | null>(null)
  // Goes up each time the learner starts the question again, which also clears the mentor's chat.
  const [attempt, setAttempt] = useState(0)
  // The learner's own "It does all of this": the question is passed, and they stay on it until Next.
  const [selfPassed, setSelfPassed] = useState(false)
  // The name this question's program was saved under in My Agents, once it has been.
  const [savedAgent, setSavedAgent] = useState('')
  // In the PC window the mentor is the judge of a criteria question. The phone has no mentor, so the learner judges.
  const mentorJudges = bench && hasHost()
  // What the mentor's last verdict said about each criterion.
  const [marks, setMarks] = useState<(Mark | null)[]>([])
  // Back to the beginning of this question, to practise it again: nothing is recorded until Next.
  function startOver() {
    setCode(q.type === 'write' ? (q.starter ?? '') : '')
    setResult(null)
    setChecked(false)
    setPcRun(null)
    setPcTests(null)
    setPcNote('')
    setMentorVerdict(null)
    setSelfPassed(false)
    setSavedAgent('')
    setTicked({})
    setMarks([])
    setSelection('')
    setAttempt((n) => n + 1)
  }
  // Code highlighted in the editor is offered to the mentor. It is kept after the editor loses focus.
  const [selection, setSelection] = useState('')
  // What the last run showed, as the mentor is told it.
  function latestOutput(): string {
    if (python === 'pc' && pcRun) {
      const printed = pcRun.chunks.map((c) => c.text).join('')
      const done = pcRun.done
      const status = !done ? '[still running]' : done.problem ? done.problem : done.stopped ? '[stopped by the learner]' : done.code ? `[ended with an error, exit code ${done.code}]` : '[finished without an error]'
      const tests = pcTests ? '\n' + pcTests.map((t) => `${t.passed ? 'PASSED' : 'FAILED'}: ${t.name}${t.message ? ` (${t.message})` : ''}`).join('\n') : ''
      return `${printed}\n${status}${tests}${pcNote ? `\n${pcNote}` : ''}`
    }
    if (result) {
      const error = result.error ? `\n${result.error.traceback || `${result.error.type}: ${result.error.message}`}` : ''
      const tests = checked ? '\n' + result.tests.map((t) => `${t.passed ? 'PASSED' : 'FAILED'}: ${t.name}${t.message ? ` (${t.message})` : ''}`).join('\n') : ''
      return `${result.stdout}${error}${tests}`
    }
    return ''
  }
  // A verdict appears in the question panel, so the panel opens for it.
  useEffect(() => {
    if (phase !== 'asking') setSideOpen(true)
  }, [phase])

  const runRef = useRef<() => void>(() => undefined)
  runRef.current = () => {
    if (!busy && !(python === 'pc' && !host?.python)) void runWrite(false)
  }
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!bench) return
    // Capture phase, so Ctrl+Enter runs the code instead of adding a line in the editor.
    const onKey = (e: KeyboardEvent) => {
      if (!root.current?.offsetParent) return
      if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F5') {
        e.preventDefault()
        e.stopPropagation()
        runRef.current()
      }
    }
    // Follows what is highlighted in this question's editor, and ignores selections made anywhere else.
    const onSelect = () => {
      const picked = document.getSelection()
      const editor = root.current?.querySelector('.cm-content')
      if (!picked || !editor || !picked.anchorNode || !editor.contains(picked.anchorNode)) return
      setSelection(picked.toString())
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('selectionchange', onSelect)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('selectionchange', onSelect)
    }
  }, [bench])

  const head = (
    <>
      <p className="muted small">
        {pick.setTitle}
        {q.topic ? ` · ${q.topic}` : ''} · {q.type === 'recall' ? 'From memory' : q.type === 'choice' ? 'Pick one' : q.type === 'predict' ? 'Predict the output' : 'Write code'}
      </p>
      {fault && <p className="notice">This question may be faulty. {fault}. Skip it, and tell whoever wrote the set.</p>}
      <p className="rev-question">{q.question}</p>
    </>
  )

  const verdict = phase !== 'asking' && q.type !== 'recall' && (
    <div data-testid="rev-verdict">
      <p className={phase === 'right' ? 'rev-good' : 'rev-bad'}>
        <strong>{phase === 'right' ? 'Right.' : q.type === 'write' ? 'It passes, but the solution was shown, so it will come back.' : 'Not this time. It will come back.'}</strong>
      </p>
      {'why' in q && q.why && <p>{q.why}</p>}
      <div className="row">
        <button className="primary" onClick={() => next(phase === 'right')}>
          Next
        </button>
      </div>
    </div>
  )

  const foot = (
    <div className="row rev-foot">
      {phase === 'asking' && q.type === 'write' && solutionShown && <button onClick={() => next(false)}>Move on</button>}
      {phase === 'asking' && (
        <button className="quiet" onClick={() => next(null)} title="Leaves this question as it was">
          Skip
        </button>
      )}
    </div>
  )

  if (q.type !== 'write') {
    return (
      <div className="rev-card" data-testid="rev-question">
        {head}
        {q.code && <pre className="code">{q.code}</pre>}

        {q.type === 'recall' && (
          <>
            <textarea rows={3} value={typed} onChange={(ev) => setTyped(ev.target.value)} placeholder="Say it or type it, then compare." disabled={shown} />
            {!shown ? (
              <div className="row">
                <button className="primary" onClick={() => setShown(true)}>
                  Show answer
                </button>
              </div>
            ) : (
              <>
                <h3>Answer</h3>
                <p className="rev-answer">{q.answer}</p>
                <div className="row">
                  <button className="primary" onClick={() => next(true)}>
                    I had it
                  </button>
                  <button onClick={() => next(false)}>Not yet</button>
                </div>
              </>
            )}
          </>
        )}

        {q.type === 'choice' && (
          <>
            <div className="rev-options">
              {q.options.map((option, i) => (
                <button
                  key={i}
                  className={chosen === null ? 'rev-option' : i === q.answer ? 'rev-option right' : i === chosen ? 'rev-option wrong' : 'rev-option'}
                  disabled={chosen !== null}
                  onClick={() => {
                    setChosen(i)
                    setPhase(i === q.answer ? 'right' : 'wrong')
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        )}

        {q.type === 'predict' && (
          <>
            <textarea className="mono" rows={4} value={typed} onChange={(ev) => setTyped(ev.target.value)} placeholder="Type exactly what it prints, one line per line. If it stops with an error, type the error's name." disabled={phase !== 'asking'} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
            {phase === 'asking' && (
              <div className="row">
                <button className="primary" onClick={checkPredict} disabled={busy}>
                  {busy ? 'Running…' : 'Check'}
                </button>
              </div>
            )}
            {truth !== null && (
              <>
                <h3>What it really prints</h3>
                <pre className="code">{truth || '(nothing)'}</pre>
              </>
            )}
          </>
        )}

        {verdict}
        {foot}
      </div>
    )
  }

  const pcBlocked = python === 'pc' && !host?.python
  const given = (
    <>
      {q.setup && (
        <>
          <h3>Already exists before your code</h3>
          <pre className="code">{q.setup}</pre>
        </>
      )}
      {q.criteria && (
        <>
          <h3>{judged ? (wide && hasHost() ? 'It is done when (the mentor judges)' : 'It is done when (you judge)') : 'It should also'}</h3>
          <ul className="rev-criteria">
            {q.criteria.map((c, i) => (
              <li key={i}>
                {wide && hasHost() ? (
                  <div className="rev-mark" data-mark={marks[i] ?? 'none'} title={marks[i] ? `The mentor: ${marks[i]}` : 'Not judged yet'}>
                    <b aria-hidden="true">{marks[i] === 'met' ? '✓' : marks[i] === 'not met' ? '✗' : marks[i] === 'not shown' ? '?' : '○'}</b>
                    <span>
                      {c}
                      {marks[i] && marks[i] !== 'met' && <em> ({marks[i]})</em>}
                    </span>
                  </div>
                ) : (
                  <label>
                    <input type="checkbox" checked={!!ticked[i]} onChange={(ev) => setTicked((t) => ({ ...t, [i]: ev.target.checked }))} /> <span>{c}</span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {q.prompts && (
        <>
          <h3>Things to type into it</h3>
          <ul className="rev-prompts">
            {q.prompts.map((p, i) => (
              <li key={i}>
                <button
                  className="quiet"
                  disabled={!(python === 'pc' && pcRun && !pcRun.done)}
                  title="While the program is running, this types the line into it"
                  onClick={() => {
                    sendToHost({ type: 'stdin', text: p })
                    setPcRun((r) => (r ? addChunk(r, 'in', p + '\n') : r))
                  }}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {(q.tests?.length || q.output !== undefined) && (
        <>
          <h3>What Check tries</h3>
          <ul className="rev-tests">
            {(q.tests ?? []).map((t, i) => (
              <li key={i}>
                <code>{t.run}</code> should equal <code>{t.expect}</code>
              </li>
            ))}
            {q.output !== undefined && (
              <li>
                The program should print exactly:
                <pre className="code">{q.output}</pre>
              </li>
            )}
          </ul>
        </>
      )}
    </>
  )

  const buttons = (
    <>
      {busy && (bench || python === 'pc') ? (
        <button className={bench ? 'primary' : undefined} onClick={() => (python === 'pc' ? sendToHost({ type: 'stop' }) : getRunner().stop())}>
          Stop
        </button>
      ) : (
        <button className={bench ? 'primary' : undefined} onClick={() => runWrite(false)} disabled={busy || pcBlocked} title={bench ? 'Ctrl+Enter or F5' : undefined}>
          Run
        </button>
      )}
      {!judged && (
        <button className={bench ? undefined : 'primary'} onClick={() => runWrite(true)} disabled={busy || pcBlocked}>
          {busy && !bench ? 'Running…' : 'Check'}
        </button>
      )}
      {busy && !bench && python !== 'pc' && <button onClick={() => getRunner().stop()}>Stop</button>}
      {hasHost() && !phone && (
        <select value={python} onChange={(ev) => choosePython(ev.target.value as PythonChoice)} disabled={busy} aria-label="Which Python runs the code">
          <option value="builtin">Built-in Python</option>
          <option value="pc">{host?.python ? `PC Python ${host.python.version}` : 'PC Python'}</option>
        </select>
      )}
      {bench && <span className="pad-space" />}
      {hasHost() && python === 'pc' && (
        <>
          {!(phone && host?.hasKey) && (
            <button className="quiet" onClick={() => sendToHost({ type: 'key' })} title="Anthropic API key for your programs">
              {host?.hasKey ? 'Key ✓' : 'Key…'}
            </button>
          )}
          {!phone && (
            <button className="quiet" onClick={() => sendToHost({ type: 'folder' })} title={host?.workDir}>
              Folder
            </button>
          )}
        </>
      )}
      {bench && (
        <button
          className="quiet"
          disabled={busy}
          onClick={() => {
            if (code.trim() === (q.starter ?? '').trim() || window.confirm('Start this question again? Your code is replaced by what the question began with, and the output and the mentor chat are emptied.')) startOver()
          }}
          title="Starts the question again: your code, the output and the mentor chat are cleared"
        >
          Reset
        </button>
      )}
      {!bench && !!q.solution && !solutionShown && phase === 'asking' && (
        <button className="quiet" onClick={() => setSolutionShown(true)}>
          Show solution
        </button>
      )}
    </>
  )

  const judge = judged && phase === 'asking' && (
    <>
      {!hasHost() && live && <p className="notice">This question calls Claude or waits for typing, which needs the PC or phone app. Skip it here.</p>}
      <p className="muted small">
        {mentorJudges
          ? 'Run it and try it, then ask the mentor to judge. It marks each line of the list, and only its verdict passes the question.'
          : 'Nothing checks this one automatically. Run it, try it, and decide for yourself.'}
      </p>
      {mentorJudges ? (
        <>
          <div className="row">
            <button
              className="primary"
              disabled={!host?.hasKey || mentorVerdict === 'done'}
              title={host?.hasKey ? 'Sends your code, the criteria and the output of your last run to the mentor' : 'Needs your API key: press Key… first'}
              onClick={() => {
                showMentor(true)
                setMentorVerdict('asked')
                setJudgeRequest((n) => n + 1)
              }}
            >
              Ask the mentor to judge
            </button>
          </div>
          <div className="row">
            <button onClick={() => next(false)} title="Records this question as not done, so it comes back, and goes to the next one">
              Not done, move on →
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="primary" onClick={() => setSelfPassed(true)} disabled={selfPassed} title="Marks this question as passed. You stay here until you press Next question.">
            It does all of this
          </button>
          <button onClick={() => next(false)} title="Records this question as not done, so it comes back, and goes to the next one">
            Not done, move on →
          </button>
        </div>
      )}
      {(mentorVerdict === 'done' || selfPassed) && (
        <div className="rev-passed" data-testid="rev-passed">
          <Confetti key={attempt} />
          <p className="rev-good">
            <strong>Passed.</strong> {mentorVerdict === 'done' ? 'The mentor found every criterion met.' : 'You judged every criterion met.'}
          </p>
          <div className="row">
            <button className="primary" onClick={() => next(!solutionShown)}>
              Next question →
            </button>
            <button onClick={startOver} disabled={busy} title="Puts the editor back to how the question began and empties the output and the mentor chat">
              Do it again from the start
            </button>
          </div>
          {hostKind() === 'pc' && live && q.type === 'write' && (
            <div className="row">
              <button
                disabled={!!savedAgent}
                title="Keeps this program in My Agents, where you can use it as a chatbot and keep changing it"
                onClick={() => setSavedAgent(saveAsAgent(q.topic || pick.setTitle, writeRun(q, code).code) ?? '')}
              >
                {savedAgent ? `Saved as “${savedAgent}”` : 'Save to My Agents'}
              </button>
            </div>
          )}
        </div>
      )}
      {mentorVerdict && mentorVerdict !== 'asked' && mentorVerdict !== 'done' && (
        <p className={mentorVerdict === 'not yet' ? 'rev-bad' : 'rev-warn'} data-testid="rev-mentor-verdict">
          <strong>Mentor: {mentorVerdict === 'not yet' ? 'not yet.' : 'test more.'}</strong>{' '}
          {mentorVerdict === 'not yet'
              ? marks.length > 0 && marks.every((m) => m === 'met')
                ? 'Every listed line is met, but the mentor found a mistake in the code. Its reasons are in the mentor panel.'
                : 'Its reasons are in the mentor panel.'
              : 'Nothing has failed, but something has not been shown yet. The mentor panel says what to run; then ask again.'}
        </p>
      )}
    </>
  )

  const output = (
    <>
      {hasHost() && python === 'builtin' && (live || needsNetwork(code)) && (
        <p className="muted small">This code calls Claude or waits for typing. The built-in Python has no API key and no input line: switch to PC Python.</p>
      )}
      {pcBlocked && host && <p className="notice bad">No Python installation was found on this PC. Switch to Built-in Python.</p>}
      {python === 'pc' && host && !host.hasKey && needsNetwork(`${q.setup ?? ''}\n${code}`) &&<p className="muted small">No API key is saved yet. {phone ? 'Add one in Settings (Key…)' : 'Press Key…'} before running code that calls Claude.</p>}
      {python === 'pc' && pcRun && (
        <div data-testid="rev-result">
          <PcOutput
            run={pcRun}
            onInput={(text) => {
              sendToHost({ type: 'stdin', text })
              setPcRun((r) => (r ? addChunk(r, 'in', text + '\n') : r))
            }}
          />
          {setupLines > 0 && pcRun.done?.code ? <p className="muted small">Line numbers in the error count the {setupLines} lines of existing code above yours.</p> : null}
          {pcNote && <p className="rev-bad">{pcNote}</p>}
          {pcTests && (
            <ul className="rev-tests">
              {pcTests.map((t, i) => (
                <li key={i} className={t.passed ? 'rev-good' : 'rev-bad'}>
                  {t.passed ? 'Passed' : 'Failed'}: <code>{t.name}</code>
                  {!t.passed && t.message ? ` — ${t.message}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {python !== 'pc' && result && (
        <div data-testid="rev-result">
          {result.stdout && <pre className="code">{result.stdout}</pre>}
          {result.error && <p className="rev-bad">{errorLine(result, setupLines)}</p>}
          {!result.error && !checked && !result.stdout && <p className="muted">It ran and printed nothing.</p>}
          {checked && !result.error && (
            <ul className="rev-tests">
              {result.tests.map((t, i) => (
                <li key={i} className={t.passed ? 'rev-good' : 'rev-bad'}>
                  {t.passed ? 'Passed' : 'Failed'}: <code>{t.name}</code>
                  {!t.passed && t.message ? ` — ${t.message}` : ''}
                  {!t.passed && t.expected !== undefined ? ` Expected ${t.expected}, got ${t.actual ?? 'nothing'}.` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )

  const solution = solutionShown && (
    <>
      <h3>A solution</h3>
      <pre className="code">{q.solution}</pre>
      {phase === 'asking' && <p className="muted small">This one will come back, because the solution was shown. Type it out and check it, or move on.</p>}
    </>
  )

  if (bench) {
    const nothingYet = !(python === 'pc' ? pcRun : result)
    return (
      <div className="rev-bench" data-testid="rev-question" ref={root}>
        {phone && (sideOpen || mentorOpen) && (
          <div
            className="rev-backdrop"
            onClick={() => {
              showSide(false)
              showMentor(false)
            }}
          />
        )}
        {sideOpen ? (
          <aside className="rev-side">
            <div className="row rev-side-top">
              <button className="quiet" onClick={() => showSide(false)} title="Hide the question to give the editor the whole width">
                ◂ Hide
              </button>
            </div>
            {head}
            {given}
            {judge}
            {verdict}
            {!!q.solution && !solutionShown && phase === 'asking' && (
              <div className="row">
                <button className="quiet" onClick={() => setSolutionShown(true)}>
                  Show solution
                </button>
              </div>
            )}
            {solution}
            {foot}
          </aside>
        ) : (
          <button className="rev-side-closed" onClick={() => showSide(true)} title="Show the question">
            ▸ Question
          </button>
        )}
        <div className="pad">
          <div className="pad-editor rev-editor-fill" style={split.upper}>
            <CodeEditor value={code} onChange={setCode} showKeys={phone && phoneKeys} fill />
          </div>
          {split.divider}
          <div className="row pad-bar">{buttons}</div>
          <div className="pad-output" style={split.lower} aria-live="polite">
            {output}
            {nothingYet && <p className="muted">{judged ? 'Output appears here. Run starts your program; type into it in the line that appears, and press Stop to end it.' : 'Output appears here. Run shows what your code prints; Check also runs the tests listed with the question.'}</p>}
          </div>
        </div>
        {hasHost() && (
          <>
            <Mentor
              question={q}
              state={() => ({ code, output: latestOutput(), selection })}
              hasKey={!!host?.hasKey}
              selection={selection}
              onClearSelection={() => setSelection('')}
              onSolutionAsked={() => setSolutionShown(true)}
              onHide={() => showMentor(false)}
              open={mentorOpen}
              judgeRequest={judgeRequest}
              onVerdict={(v, reply) => {
                setMentorVerdict(v)
                // "Done" means every criterion was met, so a line the reply did not number clearly still counts.
                setMarks(v ? readMarks(reply, q.criteria?.length ?? 0).map((m) => m ?? (v === 'done' ? 'met' : null)) : [])
                if (v === 'done' && !phone) setSideOpen(true)
              }}
              passed={mentorVerdict === 'done' || selfPassed}
              onNext={() => next(!solutionShown)}
              onAgain={startOver}
              clearRequest={attempt}
            />
            {!mentorOpen && (
              <button className="rev-side-closed rev-mentor-closed" onClick={() => showMentor(true)} title="Ask Claude about this question">
                ◂ Ask Mentor
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rev-card" data-testid="rev-question">
      {head}
      {given}
      <div className="rev-editor">
        <CodeEditor value={code} onChange={setCode} minHeight="150px" showKeys={phoneKeys} />
      </div>
      <div className="row">{buttons}</div>
      {output}
      {solution}
      {judge}
      {verdict}
      {foot}
    </div>
  )
}

export default function Revision({ storage, saveFile, phoneKeys = false, wide = false }: Props) {
  const [store, setStore] = useState<Store | null>(null)
  const [queue, setQueue] = useState<Pick[] | null>(null)
  const [position, setPosition] = useState(0)
  const [tally, setTally] = useState({ right: 0, wrong: 0 })
  const [pasted, setPasted] = useState('')
  const [message, setMessage] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const repeated = useRef(new Set<string>())
  const fileInput = useRef<HTMLInputElement>(null)
  const [host, setHost] = useState<HostInfo | null>(null)

  useEffect(() => {
    if (!hasHost()) return
    const off = onHostMessage((m) => {
      if (m.type === 'host') setHost({ python: m.python, hasKey: m.hasKey, workDir: m.workDir })
    })
    sendToHost({ type: 'hello' })
    return off
  }, [])

  useEffect(() => {
    let alive = true
    storage.load().then(
      (text) => alive && setStore(parseStore(text)),
      () => alive && setStore(emptyStore()),
    )
    return () => {
      alive = false
    }
  }, [storage])

  const update = useCallback(
    (change: (old: Store) => Store) => {
      setStore((old) => {
        const next = change(old ?? emptyStore())
        void storage.save(JSON.stringify(next))
        return next
      })
    },
    [storage],
  )

  const now = Date.now()
  const due = useMemo(() => (store ? dueNow(store, now) : []), [store, queue]) // eslint-disable-line react-hooks/exhaustive-deps

  function begin(picks: Pick[]) {
    if (picks.length === 0) return
    repeated.current = new Set()
    setTally({ right: 0, wrong: 0 })
    setPosition(0)
    setQueue(picks.slice(0, SESSION_SIZE))
  }

  function answered(pick: Pick, correct: boolean | null) {
    if (correct !== null) {
      update((old) => record(old, pick.key, correct, Date.now()))
      setTally((t) => ({ right: t.right + (correct ? 1 : 0), wrong: t.wrong + (correct ? 0 : 1) }))
      // A missed question is asked once more at the end of this session.
      if (!correct && !repeated.current.has(pick.key)) {
        repeated.current.add(pick.key)
        setQueue((q) => (q ? [...q, pick] : q))
      }
    }
    setPosition((p) => p + 1)
  }

  async function importText(text: string) {
    setMessage('')
    let parsed
    try {
      parsed = parseSet(text)
    } catch (err) {
      setMessage((err as Error).message)
      return
    }
    const stamp = Date.now()
    let added: RevisionSet | undefined
    update((old) => {
      const next = addSet(old, parsed, stamp)
      added = next.sets[next.sets.length - 1]
      return next
    })
    setPasted('')
    const left = parsed.problems.length ? ` ${parsed.problems.length} left out: ${parsed.problems.join(' ')}` : ''
    setMessage(`Added "${parsed.title}" with ${parsed.questions.length} questions.${left} Checking the code questions…`)
    const faults = await findFaults(parsed.questions, (request) => getRunner().run(request))
    const count = Object.keys(faults).length
    if (count && added) {
      const id = added.id
      update((old) => ({ ...old, sets: old.sets.map((s) => (s.id === id ? { ...s, faults } : s)) }))
    }
    const code = parsed.questions.filter((q) => q.type === 'write' || q.type === 'predict')
    const untried = code.filter((q) => needsPerson(q) || selfJudged(q)).length
    const tried = code.length - untried
    const verdict = count ? `${count} code question${count === 1 ? ' looks' : 's look'} faulty and ${count === 1 ? 'is' : 'are'} marked.` : tried ? (untried ? `The ${tried} code question${tried === 1 ? '' : 's'} that could be tried ran correctly.` : 'Every code question ran correctly.') : ''
    const skipped = untried ? ` ${untried} ${untried === 1 ? 'was' : 'were'} not tried, because ${untried === 1 ? 'it calls' : 'they call'} Claude, wait${untried === 1 ? 's' : ''} for typing or ${untried === 1 ? 'is' : 'are'} judged by you.` : ''
    setMessage(`Added "${parsed.title}" with ${parsed.questions.length} questions.${left} ${verdict}${skipped}`)
  }

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(MENTOR_INSTRUCTIONS)
      setMessage('Copied. Paste it to your mentor after a session you want to revise.')
    } catch {
      setShowHelp(true)
      setMessage('Copying is not available here, so the text is shown below. Select it and copy it.')
    }
  }

  if (!store) return <div className="rev-page">Loading…</div>

  if (queue) {
    const pick = queue[position]
    if (!pick) {
      return (
        <div className="rev-page" data-testid="rev-done">
          <h1>Session finished</h1>
          <p>
            {tally.right} right, {tally.wrong} to come back.
          </p>
          <p className="muted">A question you got right comes back after a longer gap each time: 10 minutes, then a day, 3 days, a week. A miss starts again.</p>
          <div className="row">
            <button className="primary" onClick={() => setQueue(null)}>
              Back to the sets
            </button>
          </div>
        </div>
      )
    }
    const faults = store.sets.find((s) => s.id === pick.setId)?.faults
    return (
      <div className={wide && pick.question.type === 'write' ? (hostKind() === 'phone' ? 'rev-page rev-wide rev-phone' : 'rev-page rev-wide') : 'rev-page'}>
        <div className="row spread rev-session-head">
          <span className="muted small">
            Question {position + 1} of {queue.length}
          </span>
          <button className="quiet" onClick={() => setQueue(null)}>
            End session
          </button>
        </div>
        <QuestionCard key={`${pick.key}/${position}`} pick={pick} fault={faults?.[pick.index]} phoneKeys={phoneKeys} wide={wide} host={host} onDone={(correct) => answered(pick, correct)} />
      </div>
    )
  }

  return (
    <div className="rev-page" data-testid="rev-home">
      <h1>Revision</h1>
      {store.sets.length === 0 ? (
        <p>No sets yet. Ask your mentor to turn a session into a set, then paste it below. The button under the box copies the instructions to give them.</p>
      ) : (
        <>
          <div className="row">
            <button className="primary" onClick={() => begin(due)} disabled={due.length === 0}>
              {due.length ? `Practise what is due (${Math.min(due.length, SESSION_SIZE)}${due.length > SESSION_SIZE ? ` of ${due.length}` : ''})` : 'Nothing is due right now'}
            </button>
          </div>
          <p className="muted small">Your passes are remembered. A question you pass is due again after 10 minutes, then a day, 3 days and a week, and counts as secure once you have passed it twice in a row.</p>
          <ul className="rev-sets">
            {store.sets.map((s) => {
              const sum = setSummary(store, s.id, now)
              const faulty = Object.keys(s.faults ?? {}).length
              return (
                <li key={s.id}>
                  <div>
                    <strong>{s.title}</strong>
                    <div className="muted small" title="Passed: got right at least once. Due: ready to be asked again; a question you pass comes back after 10 minutes, then a day, 3 days and a week. Secure: passed twice in a row. Missed: got wrong last time.">
                      {sum.total} questions · {sum.passed} passed · {sum.due} due · {sum.secure} secure · {sum.missed} missed{faulty ? ` · ${faulty} possibly faulty` : ''}
                    </div>
                  </div>
                  <div className="row">
                    <button onClick={() => begin(dueNow(store, Date.now(), s.id))} disabled={sum.due === 0}>
                      Due
                    </button>
                    <button onClick={() => begin(wholeSet(store, s.id))}>All</button>
                    <button className="quiet" onClick={() => saveFile(`${s.title.replace(/[^\w -]+/g, '').trim() || 'revision-set'}.json`, JSON.stringify({ title: s.title, questions: s.questions }, null, 2))}>
                      Export
                    </button>
                    <button
                      className="quiet"
                      onClick={() => {
                        if (window.confirm(`Remove "${s.title}" and its history?`)) update((old) => removeSet(old, s.id))
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <h2>Add a set</h2>
      <textarea className="mono" rows={6} value={pasted} onChange={(ev) => setPasted(ev.target.value)} placeholder="Paste the set your mentor wrote here (the whole reply is fine), then press Add." spellCheck={false} data-testid="rev-paste" />
      <div className="row">
        <button className="primary" onClick={() => importText(pasted)} disabled={!pasted.trim()}>
          Add
        </button>
        <button onClick={() => fileInput.current?.click()}>Import a file…</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json,.txt"
          hidden
          onChange={async (ev) => {
            const file = ev.target.files?.[0]
            ev.target.value = ''
            if (file) await importText(await file.text())
          }}
        />
        <button onClick={copyInstructions}>Copy instructions for your mentor</button>
        <button className="quiet" onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? 'Hide the instructions' : 'Show the instructions'}
        </button>
      </div>
      {message && (
        <p className="notice" data-testid="rev-message">
          {message}
        </p>
      )}
      {showHelp && <pre className="code rev-help">{MENTOR_INSTRUCTIONS}</pre>}
    </div>
  )
}
