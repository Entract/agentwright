// The Scratchpad's mentor: a free-form chat with Claude about whatever is in the editor.
// Unlike the Revision mentor it has no exercise, no levels and no verdicts. It is sent the
// code, the last output and any highlighted code with each message, and replies in this
// panel only: it has no way to change the editor.
import { useEffect, useRef, useState } from 'react'
import { onHostMessage, sendToHost } from './host'
import { FREE_MENTOR_SYSTEM, conversation, freeMentorMessage, replyParts, type MentorState, type Turn } from '../revision/mentorText'

/** Request numbers for this panel, kept apart from the Revision mentor's. */
let scratchRequest = 5_000_000

interface Props {
  /** The code, output and highlighted code at the moment of asking. */
  state: () => MentorState
  hasKey: boolean
  selection: string
  onClearSelection: () => void
  onHide: () => void
  open: boolean
  /** On the phone the panel slides over the page instead of sitting beside the editor. */
  phone?: boolean
}

export default function ScratchMentor({ state, hasKey, selection, onClearSelection, onHide, open, phone = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [typed, setTyped] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [problem, setProblem] = useState('')
  const [copied, setCopied] = useState('')
  const request = useRef(0)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = onHostMessage((m) => {
      if (m.type === 'mentorText' && m.id === request.current) {
        setTurns((old) => {
          const last = old[old.length - 1]
          return last?.role === 'assistant' ? [...old.slice(0, -1), { ...last, text: last.text + m.text }] : [...old, { role: 'assistant', text: m.text }]
        })
      } else if (m.type === 'mentorDone' && m.id === request.current) {
        request.current = 0
        setWaiting(false)
        if (m.problem) setProblem(m.problem)
      }
    })
    return () => {
      off()
      if (request.current) sendToHost({ type: 'mentorStop' })
    }
  }, [])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [turns, waiting])

  function ask(text: string) {
    const said = text.trim()
    if (waiting || !hasKey || !said) return
    const turn: Turn = { role: 'user', text: said, sent: freeMentorMessage(said, { ...state(), selection }) }
    const next = [...turns, turn]
    setTurns(next)
    setTyped('')
    setProblem('')
    setWaiting(true)
    const id = ++scratchRequest
    request.current = id
    sendToHost({ type: 'mentor', id, system: FREE_MENTOR_SYSTEM, messages: conversation(next) })
  }

  const lines = selection.trim() ? selection.replace(/\n$/, '').split('\n').length : 0

  return (
    <aside className={phone ? 'rev-mentor scratch-mentor on-phone' : 'rev-mentor scratch-mentor'} data-testid="scratch-mentor" hidden={!open}>
      <div className="row spread rev-mentor-top">
        <strong>Ask Mentor</strong>
        <button className="quiet" onClick={onHide} title="Hide the mentor panel">
          Hide ▸
        </button>
      </div>
      <div className="rev-mentor-talk" aria-live="polite">
        {turns.length === 0 && (
          <>
            <p className="muted small">
              Ask anything about the code in your editor, or ask to be taught something. The mentor is sent your code, the latest output and any code you have highlighted. It replies here and cannot change your code. Each message goes to Anthropic
              with your saved key and costs a small amount.
            </p>
            {hasKey && (
              <div className="scratch-mentor-starts">
                {['What does this code do, line by line?', 'Review my code. What would you change?', 'Why did I get this error?', 'Teach me something new using this code as the example.'].map((s) => (
                  <button key={s} className="quiet" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div key={i} className="rev-mentor-you">
              <span className="muted small">You</span>
              <p>{turn.text}</p>
            </div>
          ) : (
            <div key={i} className="rev-mentor-reply">
              {replyParts(turn.text).map((part, n) =>
                part.code ? (
                  <div key={n} className="scratch-mentor-code">
                    <pre className="code">{part.text}</pre>
                    <button
                      className="quiet"
                      title="Copies this code, for you to paste where you want it"
                      onClick={() => {
                        navigator.clipboard?.writeText(part.text).then(
                          () => {
                            setCopied(`${i}/${n}`)
                            setTimeout(() => setCopied(''), 1500)
                          },
                          () => undefined,
                        )
                      }}
                    >
                      {copied === `${i}/${n}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <p key={n}>{part.text}</p>
                ),
              )}
            </div>
          ),
        )}
        {waiting && turns[turns.length - 1]?.role === 'user' && <p className="muted small">Thinking…</p>}
        {problem && <p className="rev-bad small">{problem}</p>}
        <div ref={end} />
      </div>
      <div className="rev-mentor-ask">
        {!hasKey ? (
          <div className="row">
            <span className="muted small">The mentor needs your Anthropic API key.</span>
            <button onClick={() => sendToHost({ type: 'key' })}>Key…</button>
          </div>
        ) : (
          <>
            {lines > 0 && (
              <div className="row">
                <button className="quiet rev-mentor-chip" onClick={onClearSelection} title="The highlighted code is sent with your message. Click to leave it out.">
                  {lines} highlighted line{lines === 1 ? '' : 's'} ✕
                </button>
              </div>
            )}
            <textarea
              rows={3}
              value={typed}
              onChange={(ev) => setTyped(ev.target.value)}
              placeholder="Ask about your code, or ask to be taught something (Enter sends)"
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault()
                  ask(typed)
                }
              }}
            />
            <div className="row">
              {waiting ? (
                <button onClick={() => sendToHost({ type: 'mentorStop' })}>Stop</button>
              ) : (
                <button className="primary" onClick={() => ask(typed)} disabled={!typed.trim()}>
                  Send
                </button>
              )}
              {turns.length > 0 && !waiting && (
                <button
                  className="quiet"
                  onClick={() => {
                    setTurns([])
                    setProblem('')
                  }}
                  title="Starts the conversation again"
                >
                  Clear chat
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
