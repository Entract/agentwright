// My Agents (PC window): programs the learner saved, used as chatbots. An agent is a folder of
// the learner's own files, one of which is the script that runs, started with the PC's Python
// in that folder. The chat view is that program's input() and print(), shown as a conversation.
import { Fragment, useEffect, useRef, useState } from 'react'
import CodeEditor from '../components/CodeEditor'
import { addChunk, emptyPcRun, type PcRun } from '../desktop/PcOutput'
import { hasHost, onHostMessage, sendToHost, type HostInfo } from '../desktop/host'
import { saveTextFile } from '../db/files'
import FileTabs from '../desktop/FileTabs'
import { STARTER, agentFileName, clearOldAgents, createAgent, exportAgent, fromHost, oldAgents, parseAgentFile, toBubbles, waitingPrompt, type Agent, type AgentDraft } from './store'
import { callCost, money, pretty, readTrace, summarise, summaryLine, type TraceEvent } from './trace'
import './agents.css'

/** Run numbers for this section, kept apart from the Scratchpad's, the course's and Revision's. */
let agentRun = 3_000_000
const OPEN_KEY = 'my-agents-open'

type View = 'chat' | 'code' | 'console'

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const agentsRef = useRef(agents)
  /** Where the agent folders are, for the learner to find them. */
  const [folder, setFolder] = useState('')
  /** Files typed in but not yet written to the agent's folder, as "agent id/file name". */
  const unsaved = useRef(new Set<string>())
  const saveTimer = useRef(0)
  /** Set when this section asked for a new agent, so it is opened when it arrives. */
  const expectNew = useRef(false)
  /** The file showing in Edit code. */
  const [file, setFile] = useState('')
  const [openId, setOpenId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(OPEN_KEY)
    } catch {
      return null
    }
  })
  const [view, setView] = useState<View>('chat')
  const [host, setHost] = useState<HostInfo | null>(null)
  const [run, setRun] = useState<PcRun | null>(null)
  /** The files the running program was started with, to tell when the editor has moved on from them. */
  const [ranCode, setRanCode] = useState<string | null>(null)
  const [line, setLine] = useState('')
  const [incoming, setIncoming] = useState<AgentDraft | null>(null)
  const [message, setMessage] = useState('')
  const runId = useRef(0)
  /** What the tracer reported about each call to Claude, with the exchange it happened in. */
  const [events, setEvents] = useState<{ turn: number; event: TraceEvent }[]>([])
  const [inspecting, setInspecting] = useState<number | null>(null)
  /** How many lines have been typed into the running program. */
  const typedCount = useRef(0)
  const openRef = useRef(openId)
  openRef.current = openId
  const fileInput = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLInputElement>(null)
  const nameBox = useRef<HTMLInputElement>(null)

  const agent = agents.find((a) => a.id === openId) ?? null
  const names = agent ? Object.keys(agent.files).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })) : []
  const shown = agent ? (file in agent.files ? file : agent.main in agent.files ? agent.main : (names[0] ?? '')) : ''
  /** What a run depends on: which script runs, and every file's text. */
  const snapshot = (a: Agent) => JSON.stringify([a.main, a.files])

  function keep(next: Agent[]) {
    agentsRef.current = next
    setAgents(next)
  }

  /** Changes one agent on screen. The caller tells the host program what to write. */
  function change(id: string, edit: (a: Agent) => Agent) {
    keep(agentsRef.current.map((a) => (a.id === id ? edit(a) : a)))
  }

  /** Writes every changed file to its agent's folder. Done shortly after typing, and before a start. */
  function saveFiles() {
    window.clearTimeout(saveTimer.current)
    for (const entry of unsaved.current) {
      const [id, name] = [entry.slice(0, entry.indexOf('/')), entry.slice(entry.indexOf('/') + 1)]
      const text = agentsRef.current.find((a) => a.id === id)?.files[name]
      if (text !== undefined) sendToHost({ type: 'agentFileWrite', id, name, text })
    }
    unsaved.current.clear()
  }

  function edit(id: string, name: string, text: string) {
    change(id, (a) => ({ ...a, files: { ...a.files, [name]: text } }))
    unsaved.current.add(`${id}/${name}`)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(saveFiles, 500)
  }
  const running = !!run && !run.done

  useEffect(() => {
    const off = onHostMessage((m) => {
      if (m.type === 'host') setHost({ python: m.python, hasKey: m.hasKey, workDir: m.workDir })
      else if (m.type === 'out' && m.id === runId.current) {
        const event = m.stream === 'err' ? readTrace(m.text.replace(/\r?\n$/, '')) : null
        if (!event) {
          setRun((r) => (r ? addChunk(r, m.stream, m.text) : r))
          return
        }
        setEvents((old) => [...old, { turn: typedCount.current, event }])
        const cost = callCost(event)
        const id = openRef.current
        if (cost && id) {
          change(id, (a) => ({ ...a, spentUsd: a.spentUsd + cost }))
          sendToHost({ type: 'agentMeta', id, spent: cost })
        }
      }
      else if (m.type === 'exit' && m.id === runId.current) {
        runId.current = 0
        setRun((r) => ({ ...(r ?? emptyPcRun()), done: { code: m.code, stopped: m.stopped, ms: m.ms, problem: m.problem } }))
        // The program may have written files of its own, such as a saved conversation.
        sendToHost({ type: 'agents' })
      } else if (m.type === 'agents') {
        // A file being typed in right now keeps what is on screen.
        const before = new Map(agentsRef.current.map((a) => [a.id, a]))
        keep(
          fromHost(m.agents).map((a) => {
            const old = before.get(a.id)
            if (!old) return a
            const files = { ...a.files }
            for (const name of Object.keys(old.files)) if (unsaved.current.has(`${a.id}/${name}`)) files[name] = old.files[name]
            return { ...a, files }
          }),
        )
        setFolder(m.folder)
        if (m.problem) setMessage(m.problem)
        if (m.created && expectNew.current) {
          expectNew.current = false
          open(m.created)
          setView('code')
          // A new agent starts with its name selected, ready to be typed over.
          setTimeout(() => nameBox.current?.select(), 50)
        }
      } else if (m.type === 'agentProblem') {
        expectNew.current = false
        setMessage(m.problem)
      } else if (m.type === 'agentsBackedUp') {
        clearOldAgents()
        setMessage('Agents saved by the earlier version have been cleared: each agent now has its own folder. A copy of the old ones is in the agents folder.')
      }
    })
    sendToHost({ type: 'hello' })
    sendToHost({ type: 'agents' })
    // The first version kept agents inside this window. They are cleared, with a copy left on disk.
    const old = oldAgents()
    if (old) sendToHost({ type: 'agentsBackup', json: old })
    return () => {
      off()
      saveFiles()
      if (runId.current) sendToHost({ type: 'stop' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [run, view])

  function open(id: string | null) {
    if (runId.current) sendToHost({ type: 'stop' })
    runId.current = 0
    setRun(null)
    setEvents([])
    setInspecting(null)
    setRanCode(null)
    setOpenId(id)
    setFile('')
    setView('chat')
    setMessage('')
    try {
      if (id) localStorage.setItem(OPEN_KEY, id)
      else localStorage.removeItem(OPEN_KEY)
    } catch {
      // Not remembered.
    }
  }

  function start() {
    if (!agent || !host?.python) return
    if (runId.current) sendToHost({ type: 'stop' })
    const id = ++agentRun
    runId.current = id
    setRun(emptyPcRun())
    setEvents([])
    setInspecting(null)
    typedCount.current = 0
    saveFiles()
    setRanCode(snapshot(agent))
    setView((v) => (v === 'code' ? 'chat' : v))
    sendToHost({ type: 'run', id, code: '', agent: agent.id })
    setTimeout(() => box.current?.focus(), 50)
  }

  function say() {
    if (!running) return
    typedCount.current += 1
    sendToHost({ type: 'stdin', text: line })
    setRun((r) => (r ? addChunk(r, 'in', line + '\n') : r))
    setLine('')
  }

  function create(draft: AgentDraft) {
    expectNew.current = true
    setMessage('')
    createAgent(draft)
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    const read = parseAgentFile(await file.text(), file.name)
    if ('problem' in read) setMessage(read.problem)
    else {
      setMessage('')
      setIncoming(read)
    }
  }

  if (!hasHost()) return <div className="agents-empty"><p className="muted">My Agents runs your programs with the Python installed on this PC, so it needs the Python Scratchpad window.</p></div>

  const bubbles = run ? toBubbles(run.chunks, running) : []
  const prompt = run && running ? waitingPrompt(run.chunks) : ''
  const stale = ranCode !== null && agent !== null && ranCode !== snapshot(agent)

  /** The line under an exchange saying what it took, and, when opened, every call to Claude in it. */
  function inspector(turn: number) {
    const mine = events.filter((e) => e.turn === turn).map((e) => e.event)
    if (mine.length === 0) return null
    const results = new Map(mine.flatMap((e) => e.request.results).map((r) => [r.tool_use_id, r]))
    const open = inspecting === turn
    return (
      <div className="agents-trace" data-testid="agents-trace">
        <button className="quiet agents-trace-line" onClick={() => setInspecting(open ? null : turn)} title="Shows each call your program made to Claude for this reply">
          {open ? '▾' : '▸'} {summaryLine(summarise(mine))}
        </button>
        {open && (
          <ol className="agents-calls">
            {mine.map((e) => (
              <li key={e.n}>
                <p className="muted small">
                  Call {e.n} · {e.response?.model || e.request.model} · {e.request.messages} message{e.request.messages === 1 ? '' : 's'} sent
                  {e.request.tools.length ? ` · tools offered: ${e.request.tools.join(', ')}` : ' · no tools offered'} · {(e.ms / 1000).toFixed(1)} s
                </p>
                {e.error && <p className="pc-bad">The call failed: {e.error}</p>}
                {e.streamed && <p className="muted small">This reply was streamed, so its contents are not captured here.</p>}
                {e.note && <p className="muted small">{e.note}</p>}
                {e.response && (
                  <>
                    {e.response.text && <p className="agents-said">Claude said: {e.response.text}</p>}
                    {e.response.calls.map((c, n) => {
                      const back = results.get(c.id)
                      return (
                        <div key={n} className="agents-call">
                          <p>
                            <strong>Claude asked for {c.name}</strong>
                            {c.server ? ' (run by Anthropic)' : ''}
                          </p>
                          <pre className="code">{pretty(c.input)}</pre>
                          {back ? (
                            <>
                              <p className={back.is_error ? 'pc-bad' : undefined}>{back.is_error ? 'Your Python reported an error:' : 'Your Python returned:'}</p>
                              <pre className="code">{pretty(back.content)}</pre>
                            </>
                          ) : c.server ? null : (
                            <p className="muted small">No result for this request was sent back in this exchange.</p>
                          )}
                        </div>
                      )
                    })}
                    <p className="muted small">
                      Stopped because: {e.response.stop_reason ?? 'unknown'} · {e.response.usage.input.toLocaleString('en-US')} tokens in, {e.response.usage.output.toLocaleString('en-US')} out
                      {e.response.usage.cache_read ? `, ${e.response.usage.cache_read.toLocaleString('en-US')} read from cache` : ''}
                      {e.response.usage.cache_write ? `, ${e.response.usage.cache_write.toLocaleString('en-US')} written to cache` : ''} · about {money(callCost(e))}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  }

  return (
    <div className="agents" data-testid="agents">
      <aside className="agents-list">
        <div className="row">
          <button className="primary" onClick={() => create({ name: 'New agent', description: '', main: 'main.py', files: { 'main.py': STARTER } })}>
            New agent
          </button>
          <button onClick={() => fileInput.current?.click()}>Import…</button>
          <input ref={fileInput} type="file" accept=".json,.py,application/json,text/x-python" hidden onChange={(e) => { void chooseFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {agents.length === 0 && <p className="muted small">No agents yet. Start a new one, import one, or press “Save as agent” in the Scratchpad.</p>}
        <ul>
          {agents.map((a) => (
            <li key={a.id}>
              <button className={a.id === openId ? 'agents-item active' : 'agents-item'} onClick={() => open(a.id)}>
                <span>{a.name}</span>
                {a.description && <span className="muted small">{a.description}</span>}
              </button>
            </li>
          ))}
        </ul>
        {message && <p className="notice bad small" data-testid="agents-message">{message}</p>}
        {folder && (
          <button className="quiet agents-folder" onClick={() => sendToHost({ type: 'agentFolder', id: '' })} title={folder}>
            Open the agents folder
          </button>
        )}
      </aside>

      {incoming ? (
        <section className="agents-main" data-testid="agents-import">
          <div className="agents-pad">
            <h2>Import “{incoming.name}”?</h2>
            <p className="notice">
              An agent is a program. When you run it, it runs on this PC with your files and your API key within reach, like any script you start yourself. Read the code below, and only add it if you understand it or trust where it came
              from.
            </p>
            <p className="muted small">
              It runs <code>{incoming.main}</code>
              {Object.keys(incoming.files).length > 1 ? ` and brings ${Object.keys(incoming.files).length - 1} more file${Object.keys(incoming.files).length === 2 ? '' : 's'}. Read all of them.` : '.'}
            </p>
            {[incoming.main, ...Object.keys(incoming.files).filter((name) => name !== incoming.main)].map((name) => (
              <Fragment key={name}>
                <p className="agents-preview-name">
                  <code>{name}</code>
                  {name === incoming.main ? ' (the script that runs)' : ''}
                </p>
                <pre className="code agents-preview">{incoming.files[name]}</pre>
              </Fragment>
            ))}
            <div className="row">
              <button
                className="primary"
                onClick={() => {
                  create(incoming)
                  setIncoming(null)
                }}
              >
                I have read it: add to My Agents
              </button>
              <button onClick={() => setIncoming(null)}>Cancel</button>
            </div>
          </div>
        </section>
      ) : !agent ? (
        <section className="agents-main">
          <div className="agents-pad">
            <h2>My Agents</h2>
            <p>Save a program you wrote and use it as a chatbot. It reads what you say with <code>input()</code> and answers with <code>print()</code>; everything else is up to your code.</p>
            <p className="muted">Pick an agent on the left, or start a new one.</p>
          </div>
        </section>
      ) : (
        <section className="agents-main">
          <div className="row agents-head">
            <label className="muted small" htmlFor="agent-name">
              Name
            </label>
            <input id="agent-name" ref={nameBox} className="agents-name" value={agent.name} placeholder="Name this agent" title="Type here to rename this agent" aria-label="Agent name" onChange={(e) => { change(agent.id, (a) => ({ ...a, name: e.target.value })); sendToHost({ type: 'agentMeta', id: agent.id, name: e.target.value }) }} />
            <div className="agents-views" role="tablist">
              {(['chat', 'code', 'console'] as View[]).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : undefined} onClick={() => setView(v)}>
                  {v === 'chat' ? 'Chat' : v === 'code' ? 'Edit code' : 'Console'}
                </button>
              ))}
            </div>
            <span className="pad-space" />
            {agent.spentUsd ? (
              <span className="muted small" title="An estimate of what this agent's calls to Claude have cost from this window, from the token counts each call reported" data-testid="agents-spent">
                about {money(agent.spentUsd)} spent
              </span>
            ) : null}
            {running ? (
              <button onClick={() => sendToHost({ type: 'stop' })}>Stop</button>
            ) : null}
            <button className="primary" onClick={start} disabled={!host?.python} title={running ? 'Stops the program and starts it again with the code as it is now. The conversation starts again.' : 'Starts the program'}>
              {running ? 'Restart' : run ? 'Start again' : 'Start'}
            </button>
            <button className="quiet" onClick={() => sendToHost({ type: 'key' })} title="Anthropic API key for your programs">
              {host?.hasKey ? 'Key ✓' : 'Key…'}
            </button>
            <button className="quiet" onClick={() => void saveTextFile(agentFileName(agent), exportAgent(agent))} title="Saves this agent as a file to share. The file holds the agent's files and its name, not your key. Check that none of its files holds something private, such as a saved conversation.">
              Export
            </button>
            <button
              className="quiet"
              onClick={() => {
                if (!window.confirm(`Delete “${agent.name}”? Its folder, with all its files, goes to the Recycle Bin.`)) return
                const id = agent.id
                open(null)
                keep(agentsRef.current.filter((a) => a.id !== id))
                sendToHost({ type: 'agentDelete', id })
              }}
            >
              Delete
            </button>
          </div>
          {host && !host.python && <p className="notice bad">No Python installation was found on this PC. Install Python from python.org and reopen the window.</p>}
          {stale && (
            <p className="notice agents-stale" data-testid="agents-stale">
              The code has changed since this conversation started. {running ? 'The program still running is the old code.' : ''} Press <strong>{running ? 'Restart' : 'Start again'}</strong> to use the new code; the conversation starts again.
            </p>
          )}

          {view === 'code' && (
            <div className="agents-code">
              <input
                className="agents-description"
                value={agent.description}
                placeholder="One line on what this agent does (optional)"
                aria-label="Description"
                onChange={(e) => { change(agent.id, (a) => ({ ...a, description: e.target.value })); sendToHost({ type: 'agentMeta', id: agent.id, description: e.target.value }) }}
              />
              <div className="row agents-files">
                <FileTabs
                  names={names}
                  shown={shown}
                  main={agent.main}
                  onPick={setFile}
                  onCreate={(name) => {
                    change(agent.id, (a) => ({ ...a, files: { ...a.files, [name]: '' } }))
                    sendToHost({ type: 'agentFileWrite', id: agent.id, name, text: '' })
                    setFile(name)
                  }}
                  onRemove={(name) => {
                    if (!window.confirm(`Remove ${name} from this agent? It goes to the Recycle Bin.`)) return
                    unsaved.current.delete(`${agent.id}/${name}`)
                    change(agent.id, (a) => ({ ...a, files: Object.fromEntries(Object.entries(a.files).filter(([n]) => n !== name)) }))
                    setFile('')
                    sendToHost({ type: 'agentFileDelete', id: agent.id, name })
                  }}
                  note={agent.skipped ? `${agent.skipped} file${agent.skipped === 1 ? ' is' : 's are'} in the folder but not shown as a tab (too large, or too many).` : ''}
                  newTitle="New file in this agent's folder: a Python file to import, or a data file"
                />
              </div>
              <div className="row agents-file-bar">
                {shown === agent.main ? (
                  <span className="muted small" data-testid="agents-main-note">
                    ▶ <code>{shown}</code> is the script that runs when the agent starts.
                  </span>
                ) : shown.toLowerCase().endsWith('.py') ? (
                  <>
                    <span className="muted small">
                      <code>{shown}</code> is a module. The agent runs <code>{agent.main}</code>.
                    </span>
                    <button
                      className="quiet"
                      data-testid="agents-make-main"
                      onClick={() => {
                        change(agent.id, (a) => ({ ...a, main: shown }))
                        sendToHost({ type: 'agentMeta', id: agent.id, main: shown })
                      }}
                      title="Makes this the script that runs when the agent starts"
                    >
                      Run this one instead
                    </button>
                  </>
                ) : (
                  <span className="muted small">
                    <code>{shown}</code> is a data file. The agent runs <code>{agent.main}</code>.
                  </span>
                )}
                <span className="pad-space" />
                <button className="quiet" onClick={() => sendToHost({ type: 'agentFolder', id: agent.id })} title="Opens this agent's folder">
                  Folder
                </button>
              </div>
              <div className="agents-editor">
                <CodeEditor key={`${agent.id}/${shown}`} value={agent.files[shown] ?? ''} onChange={(text) => edit(agent.id, shown, text)} showKeys={false} fill />
              </div>
            </div>
          )}

          {view === 'console' && (
            <div className="agents-console">
              {run ? (
                <pre className="code output pc-stream">
                  {run.chunks.map((c, i) => (
                    <span key={i} className={`stream-${c.kind}`}>
                      {c.text}
                    </span>
                  ))}
                </pre>
              ) : (
                <p className="muted">Everything the program prints, exactly as printed, appears here once it is started.</p>
              )}
              <div ref={end} />
            </div>
          )}

          {view === 'chat' && (
            <div className="agents-chat" data-testid="agents-chat">
              <div className="agents-talk" aria-live="polite">
                {!run && <p className="muted">Press Start to run this agent. What it prints appears here as its side of the conversation.</p>}
                {bubbles.map((b, i) => (
                  <Fragment key={i}>
                    <div className={`agents-bubble ${b.who}`}>{b.text || <span className="muted">(empty line)</span>}</div>
                    {bubbles[i + 1]?.turn !== b.turn && inspector(b.turn)}
                  </Fragment>
                ))}
                {[...new Set(events.map((e) => e.turn))].filter((t) => !bubbles.some((b) => b.turn === t)).map((t) => <Fragment key={`t${t}`}>{inspector(t)}</Fragment>)}
                {running && run!.chunks[run!.chunks.length - 1]?.kind === 'in' && <p className="muted small">Working…</p>}
                {run?.done && (
                  <p className={`small ${run.done.problem || (run.done.code && !run.done.stopped) ? 'pc-bad' : 'muted'}`} data-testid="agents-ended">
                    {run.done.problem
                      ? run.done.problem
                      : run.done.stopped
                        ? 'Stopped.'
                        : run.done.code
                          ? 'The program ended with an error. The Console tab shows it exactly as printed.'
                          : 'The program finished.'}
                  </p>
                )}
                <div ref={end} />
              </div>
              <form
                className="row agents-say"
                onSubmit={(e) => {
                  e.preventDefault()
                  say()
                }}
              >
                <input ref={box} type="text" value={line} disabled={!running} onChange={(e) => setLine(e.target.value)} placeholder={running ? prompt.trim() || 'Type a message and press Enter' : 'Start the agent to talk to it'} aria-label="Message" />
                <button className="primary" disabled={!running}>
                  Send
                </button>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
