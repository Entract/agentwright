import { useCallback, useEffect, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor'
import RunOutput from '../components/RunOutput'
import { PythonRunner, type WorkerLike } from '../runner/client'
import { needsNetwork, type RunResult } from '../runner/core'
import { useDivider } from './Divider'
import { PcOutput, addChunk, type PcRun } from './PcOutput'
import { hasHost, onHostMessage, sendToHost, type HostInfo } from './host'
import { saveAsAgent } from '../agents/store'
import ScratchMentor from './ScratchMentor'
import '../revision/revision.css'

const STORE_KEY = 'scratchpad-code'
const MODE_KEY = 'scratchpad-mode'
const MENTOR_KEY = 'scratchpad-mentor'
const SAMPLE = `readings = [9.5, 10.2, 11.8]
for reading in readings:
    print(reading)
`
type Mode = 'builtin' | 'pc'
/** A desktop can afford a longer limit than the phone's five seconds. */
const runner = new PythonRunner({
  createWorker: () => new Worker(new URL('../runner/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  indexURL: new URL('pyodide/', document.baseURI).href,
  runTimeoutMs: 10000,
})

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the value simply is not kept for next time.
  }
}

/** Free-form mode: editor on top, Run, and what the program printed (or its error) below. */
export default function Scratchpad({ active = true }: { active?: boolean }) {
  const activeRef = useRef(active)
  activeRef.current = active
  const [code, setCode] = useState(() => read(STORE_KEY, SAMPLE))
  const [mode, setMode] = useState<Mode>(() => (read(MODE_KEY, 'builtin') === 'pc' && hasHost() ? 'pc' : 'builtin'))
  const [host, setHost] = useState<HostInfo | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [pcRun, setPcRun] = useState<PcRun | null>(null)
  const [running, setRunning] = useState(false)
  const [savedAs, setSavedAs] = useState('')
  const [mentorOpen, setMentorOpen] = useState(() => read(MENTOR_KEY, 'closed') === 'open')
  // Code highlighted in the editor is offered to the mentor.
  const [selection, setSelection] = useState('')
  const pad = useRef<HTMLDivElement>(null)
  const resultRef = useRef<RunResult | null>(null)
  resultRef.current = result
  const pcRunRef = useRef<PcRun | null>(null)
  pcRunRef.current = pcRun

  function showMentor(open: boolean) {
    setMentorOpen(open)
    write(MENTOR_KEY, open ? 'open' : 'closed')
    // The panel needs room beside the editor.
    if (open) sendToHost({ type: 'size', width: 1180, height: 760 })
  }

  /** What the last run showed, as the mentor is told it. */
  function latestOutput(): string {
    if (modeRef.current === 'pc') {
      const ran = pcRunRef.current
      if (!ran) return ''
      const done = ran.done
      const status = !done ? '[still running]' : done.problem ? done.problem : done.stopped ? '[stopped]' : done.code ? `[ended with an error, exit code ${done.code}]` : '[finished without an error]'
      return `${ran.chunks.map((c) => c.text).join('')}\n${status}`
    }
    const ran = resultRef.current
    if (!ran) return ''
    return `${ran.stdout}${ran.error ? `\n${ran.error.traceback || `${ran.error.type}: ${ran.error.message}`}` : ''}`
  }

  useEffect(() => {
    const onSelect = () => {
      const picked = document.getSelection()
      const editor = pad.current?.querySelector('.cm-content')
      if (!picked || !editor || !picked.anchorNode || !editor.contains(picked.anchorNode)) return
      setSelection(picked.toString())
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [])
  const latest = useRef(code)
  const modeRef = useRef(mode)
  const busy = useRef(false)
  const runId = useRef(0)

  function change(next: string) {
    latest.current = next
    setCode(next)
    write(STORE_KEY, next)
  }

  function switchMode(next: Mode) {
    if (busy.current) return
    modeRef.current = next
    setMode(next)
    write(MODE_KEY, next)
  }

  const run = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setRunning(true)
    if (modeRef.current === 'pc') {
      const id = ++runId.current
      setPcRun({ chunks: [], size: 0, truncated: false, done: null })
      sendToHost({ type: 'run', id, code: latest.current })
      return // finished by the host's "exit" message
    }
    // The built-in Python can import anthropic too, but on the PC the key stays with PC Python.
    const network = needsNetwork(latest.current)
    setResult(await runner.run({ code: latest.current, network, timeoutMs: network ? 180000 : undefined }))
    busy.current = false
    setRunning(false)
  }, [])

  useEffect(() => {
    runner.warm()
    const off = onHostMessage((m) => {
      if (m.type === 'host') setHost({ python: m.python, hasKey: m.hasKey, workDir: m.workDir })
      else if (m.type === 'out' && m.id === runId.current && busy.current) setPcRun((r) => (r ? addChunk(r, m.stream, m.text) : r))
      else if (m.type === 'exit' && m.id === runId.current) {
        setPcRun((r) => ({ ...(r ?? { chunks: [], size: 0, truncated: false }), done: { code: m.code, stopped: m.stopped, ms: m.ms, problem: m.problem } }))
        busy.current = false
        setRunning(false)
      }
    })
    sendToHost({ type: 'hello' })
    // Capture phase, so Ctrl+Enter runs the code instead of adding a line in the editor.
    const onKey = (e: KeyboardEvent) => {
      // The other tabs stay loaded, and have the same shortcut for their own code.
      if (!activeRef.current) return
      if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F5') {
        e.preventDefault()
        e.stopPropagation()
        void run()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      off()
      window.removeEventListener('keydown', onKey, true)
    }
  }, [run])

  const split = useDivider('scratchpad-divider')
  const pc = mode === 'pc'
  const pcReady = !!host?.python

  return (
    <div className="pad-row">
    <div className="pad" ref={pad}>
      <div className="pad-editor" style={split.upper}>
        <CodeEditor value={code} onChange={change} showKeys={false} fill />
      </div>
      {split.divider}
      <div className="row pad-bar">
        {running && (pc || needsNetwork(code)) ? (
          <button className="primary" onClick={() => (pc ? sendToHost({ type: 'stop' }) : runner.stop())}>
            Stop
          </button>
        ) : (
          <button className="primary" onClick={run} disabled={running || (pc && !pcReady)} title="Ctrl+Enter or F5">
            {running ? 'Running…' : 'Run'}
          </button>
        )}
        {hasHost() && (
          <select value={mode} onChange={(e) => switchMode(e.target.value as Mode)} disabled={running} aria-label="Which Python runs the code">
            <option value="builtin">Built-in Python</option>
            <option value="pc">{host?.python ? `PC Python ${host.python.version}` : 'PC Python'}</option>
          </select>
        )}
        <span className="pad-space" />
        {!pc && result && !running && <span className="muted small">{result.durationMs} ms</span>}
        {pc && (
          <>
            <button className="quiet" onClick={() => sendToHost({ type: 'key' })} title="Anthropic API key for your programs">
              {host?.hasKey ? 'Key ✓' : 'Key…'}
            </button>
            <button className="quiet" onClick={() => sendToHost({ type: 'folder' })} title={host?.workDir}>
              Folder
            </button>
          </>
        )}
        {hasHost() && (
          <button
            className="quiet"
            disabled={!code.trim()}
            title="Saves this program to My Agents, where you can use it as a chatbot and keep changing it"
            onClick={() => {
              const name = saveAsAgent('Scratchpad agent', latest.current)
              setSavedAs(name ? `Saved as “${name}” in My Agents` : 'Could not be saved')
              setTimeout(() => setSavedAs(''), 4000)
            }}
          >
            Save as agent
          </button>
        )}
        {savedAs && <span className="muted small" data-testid="saved-as-agent">{savedAs}</span>}
        <button className="quiet" onClick={() => navigator.clipboard?.writeText(latest.current).catch(() => undefined)}>
          Copy
        </button>
        <button className="quiet" onClick={() => change('')}>
          Clear
        </button>
      </div>
      <div className="pad-output" style={split.lower} aria-live="polite">
        {pc ? (
          host && !host.python ? (
            <p className="notice bad">No Python installation was found on this PC. Install Python from python.org and reopen the scratchpad, or switch to Built-in Python.</p>
          ) : pcRun ? (
            <PcOutput
              run={pcRun}
              onInput={(text) => {
                sendToHost({ type: 'stdin', text })
                setPcRun((r) => (r ? addChunk(r, 'in', text + '\n') : r))
              }}
            />
          ) : (
            <p className="muted">
              Runs with the Python installed on this PC: your installed packages, <code>input()</code> and files all work. There is no safety net, so the code can do anything a script you run yourself can do.
            </p>
          )
        ) : result ? (
          <>
            {hasHost() && needsNetwork(code) && (
              <p className="muted small">The built-in Python has no API key on the PC. Switch to PC Python to make real calls with your saved key.</p>
            )}
            <RunOutput result={result} />
          </>
        ) : (
          <p className="muted">Output appears here.</p>
        )}
      </div>
    </div>
      {hasHost() && (
        <>
          <ScratchMentor
            state={() => ({ code: latest.current, output: latestOutput(), selection })}
            hasKey={!!host?.hasKey}
            selection={selection}
            onClearSelection={() => setSelection('')}
            onHide={() => showMentor(false)}
            open={mentorOpen}
          />
          {!mentorOpen && (
            <button className="rev-side-closed rev-mentor-closed" onClick={() => showMentor(true)} title="Ask Claude about the code in the editor">
              ◂ Ask Mentor
            </button>
          )}
        </>
      )}
    </div>
  )
}
