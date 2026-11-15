import { useCallback, useEffect, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor'
import RunOutput from '../components/RunOutput'
import { PythonRunner, type WorkerLike } from '../runner/client'
import { needsNetwork, type RunResult } from '../runner/core'
import { useDivider } from './Divider'
import { PcOutput, addChunk, type PcRun } from './PcOutput'
import { hasHost, hostKind, onHostMessage, sendToHost, type HostInfo } from './host'
import { runTarget, usedFiles } from './files'
import FileTabs from './FileTabs'
import { createAgent } from '../agents/store'
import ScratchMentor from './ScratchMentor'
import '../revision/revision.css'

const STORE_KEY = 'scratchpad-code'
const MODE_KEY = 'scratchpad-mode'
const MENTOR_KEY = 'scratchpad-mentor'
const TAB_KEY = 'scratchpad-tab'
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

  // File tabs (PC window only). The first tab, "scratch", is the program kept in this app as
  // before. The others are files in the working folder, saved as they are typed, so a program
  // can open() them and import them.
  const tabs = hostKind() === 'pc'
  const [files, setFiles] = useState<Record<string, string>>({})
  const filesRef = useRef(files)
  const [tab, setTab] = useState(() => read(TAB_KEY, ''))
  const [lastPython, setLastPython] = useState('')
  const [fileNote, setFileNote] = useState('')
  const unsaved = useRef(new Set<string>())
  const saveTimer = useRef(0)
  const names = Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  /** The file showing in the editor; '' is the scratch tab. */
  const shown = tabs && tab in files ? tab : ''
  const shownRef = useRef(shown)
  shownRef.current = shown
  const target = runTarget(shown, lastPython, names)
  const targetRef = useRef(target)
  targetRef.current = target

  function keepFiles(next: Record<string, string>) {
    filesRef.current = next
    setFiles(next)
  }

  /** Writes every changed file to the folder. Done shortly after typing, and before a run. */
  function saveFiles() {
    window.clearTimeout(saveTimer.current)
    for (const name of unsaved.current) {
      if (name in filesRef.current) sendToHost({ type: 'fileWrite', name, text: filesRef.current[name] })
    }
    unsaved.current.clear()
  }

  function pick(name: string) {
    setTab(name)
    write(TAB_KEY, name)
    if (!name || /\.py$/i.test(name)) setLastPython(name)
    setFileNote('')
  }

  function createFile(name: string) {
    sendToHost({ type: 'fileWrite', name, text: '' })
    keepFiles({ ...filesRef.current, [name]: '' })
    pick(name)
  }

  // Saving as an agent: the program and the files it needs are copied into a folder of the
  // agent's own, so nothing done here afterwards changes the agent.
  const [saving, setSaving] = useState<{ name: string; ticked: string[] } | null>(null)

  function beginSave() {
    saveFiles()
    const others = Object.fromEntries(Object.entries(filesRef.current).filter(([name]) => name !== targetRef.current))
    setSaving({ name: targetRef.current ? targetRef.current.replace(/\.py$/i, '') : 'Scratchpad agent', ticked: usedFiles(runCode(), others) })
  }

  function finishSave() {
    if (!saving) return
    const copied = Object.fromEntries(saving.ticked.filter((name) => name in filesRef.current).map((name) => [name, filesRef.current[name]]))
    // The scratch tab is not a file, so its program is given a name inside the agent.
    const main = targetRef.current || ('main.py' in copied ? 'agent_main.py' : 'main.py')
    createAgent({ name: saving.name.trim() || 'Scratchpad agent', description: '', main, files: { ...copied, [main]: runCode() } })
    awaitingSave.current = true
    setSaving(null)
  }
  const awaitingSave = useRef(false)

  function removeFile(name: string) {
    if (!window.confirm(`Remove ${name} from your folder? It goes to the Recycle Bin.`)) return
    unsaved.current.delete(name)
    const rest = { ...filesRef.current }
    delete rest[name]
    keepFiles(rest)
    pick('')
    sendToHost({ type: 'fileDelete', name })
  }

  /** The text Run starts with: the Python file chosen by the tabs, or the scratch program. */
  function runCode(): string {
    return targetRef.current ? (filesRef.current[targetRef.current] ?? '') : latest.current
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
    const name = shownRef.current
    if (name) {
      keepFiles({ ...filesRef.current, [name]: next })
      unsaved.current.add(name)
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(saveFiles, 500)
      return
    }
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
    saveFiles()
    const file = targetRef.current
    if (modeRef.current === 'pc') {
      const id = ++runId.current
      setPcRun({ chunks: [], size: 0, truncated: false, done: null })
      sendToHost(file ? { type: 'run', id, code: '', file } : { type: 'run', id, code: latest.current })
      return // finished by the host's "exit" message
    }
    // The built-in Python can import anthropic too, but on the PC the key stays with PC Python.
    const code = runCode()
    const network = needsNetwork(code)
    // The built-in Python cannot see the folder, so it is given copies of the files.
    const beside = Object.fromEntries(Object.entries(filesRef.current).filter(([name]) => name !== file))
    setResult(await runner.run({ code, files: beside, network, timeoutMs: network ? 180000 : undefined }))
    busy.current = false
    setRunning(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // The program may have written or changed files.
        if (tabs) sendToHost({ type: 'files' })
      } else if (m.type === 'files') {
        const next: Record<string, string> = {}
        // A file being typed in right now keeps what is on screen.
        for (const f of m.files) next[f.name] = unsaved.current.has(f.name) && f.name in filesRef.current ? filesRef.current[f.name] : f.text
        keepFiles(next)
        if (m.problem) setFileNote(m.problem)
        else if (m.skipped) setFileNote(`${m.skipped} file${m.skipped === 1 ? ' is' : 's are'} not shown as a tab (too large, or too many).`)
      } else if (m.type === 'fileProblem') setFileNote(m.problem)
      else if (awaitingSave.current && (m.type === 'agents' || m.type === 'agentProblem')) {
        awaitingSave.current = false
        const made = m.type === 'agents' ? m.agents.find((a) => a.id === m.created) : undefined
        setSavedAs(made ? `Saved as “${made.name}” in My Agents` : m.type === 'agentProblem' ? m.problem : 'Could not be saved')
        setTimeout(() => setSavedAs(''), 6000)
      }
    })
    sendToHost({ type: 'hello' })
    if (tabs) sendToHost({ type: 'files' })
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
    // Files are also re-read when the window comes back to the front, in case they were changed elsewhere.
    const onFocus = () => {
      if (tabs && !busy.current) sendToHost({ type: 'files' })
    }
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      saveFiles()
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  const split = useDivider('scratchpad-divider')
  const pc = mode === 'pc'
  const pcReady = !!host?.python

  return (
    <div className="pad-row">
    <div className="pad" ref={pad}>
      {tabs && (
        <FileTabs
          scratch
          names={names}
          shown={shown}
          onPick={pick}
          onCreate={createFile}
          onRemove={removeFile}
          note={fileNote}
          newTitle="New file in your folder: a Python file to import, or a data file such as schedule.json"
        />
      )}
      {saving && (
        <div className="pad-dialog-back" onClick={() => setSaving(null)}>
          <form
            className="pad-dialog"
            data-testid="save-agent"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              finishSave()
            }}
          >
            <h2>Save as agent</h2>
            <label>
              <span className="muted small">Name</span>
              <input autoFocus value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} onFocus={(e) => e.target.select()} />
            </label>
            <p>
              Runs: <code>{target || 'the scratch program'}</code>
            </p>
            {names.filter((name) => name !== target).length > 0 ? (
              <>
                <p className="muted small">Files to copy into the agent. The ones it seems to use are ticked; change this if the guess is wrong.</p>
                <ul className="pad-dialog-files">
                  {names
                    .filter((name) => name !== target)
                    .map((name) => (
                      <li key={name}>
                        <label>
                          <input
                            type="checkbox"
                            checked={saving.ticked.includes(name)}
                            onChange={(e) => setSaving({ ...saving, ticked: e.target.checked ? [...saving.ticked, name] : saving.ticked.filter((n) => n !== name) })}
                          />
                          <code>{name}</code>
                        </label>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="muted small">There are no other files in your folder to copy.</p>
            )}
            <p className="muted small">The agent gets its own copies in its own folder. What you change in the Scratchpad afterwards does not reach it; to change the agent, use Edit code in My Agents.</p>
            <div className="row">
              <button type="submit" className="primary">
                Save
              </button>
              <button type="button" onClick={() => setSaving(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="pad-editor" style={split.upper}>
        <CodeEditor key={shown} value={shown ? files[shown] : code} onChange={change} showKeys={false} fill />
      </div>
      {split.divider}
      <div className="row pad-bar">
        {running && (pc || needsNetwork(runCode())) ? (
          <button className="primary" onClick={() => (pc ? sendToHost({ type: 'stop' }) : runner.stop())}>
            Stop
          </button>
        ) : (
          <button className="primary" onClick={run} disabled={running || (pc && !pcReady)} title="Ctrl+Enter or F5">
            {running ? 'Running…' : target !== shown ? `Run ${target || 'scratch'}` : 'Run'}
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
            disabled={!runCode().trim()}
            title="Copies this program, and the files it needs, into My Agents, where you can use it as a chatbot and keep changing it"
            onClick={beginSave}
          >
            Save as agent
          </button>
        )}
        {savedAs && <span className="muted small" data-testid="saved-as-agent">{savedAs}</span>}
        <button className="quiet" onClick={() => navigator.clipboard?.writeText(shown ? files[shown] : latest.current).catch(() => undefined)}>
          Copy
        </button>
        <button className="quiet" onClick={() => change('')} title={shown ? `Empties ${shown}` : 'Empties the editor'}>
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
              Runs with the Python installed on this PC: your installed packages, <code>input()</code> and files all work. Files you make with <strong>+ New file</strong> are saved in your folder, where your program can open and import them. There is no
              safety net, so the code can do anything a script you run yourself can do.
            </p>
          )
        ) : result ? (
          <>
            {hasHost() && needsNetwork(runCode()) && (
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
            state={() => ({
              code: shownRef.current ? (filesRef.current[shownRef.current] ?? '') : latest.current,
              output: latestOutput(),
              selection,
              name: shownRef.current || (Object.keys(filesRef.current).length ? 'the scratch tab (not a file)' : undefined),
              others: Object.entries(filesRef.current)
                .filter(([name]) => name !== shownRef.current)
                .map(([name, text]) => ({ name, text })),
            })}
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
