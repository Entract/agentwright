import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { describeError } from '../tutor/anthropic'
import { askTutor, type ChatContext, type ChatTurn } from '../tutor/chat'
import { getChatAccess } from '../tutor'
import { addUsage } from '../tutor/settings'
import type { Usage } from '../tutor/anthropic'

interface Props {
  /** Read at the moment a question is sent, so the tutor sees the current answer and check result. */
  getContext: () => ChatContext
  sessionId?: number
  placeholder?: string
  /** Called the first time a question is sent. */
  onAsked?: () => void
}

/** A short question-and-answer thread with the AI tutor. The thread lives only while the screen is open. */
export default function TutorChat({ getContext, sessionId, placeholder = 'Ask a question…', onAsked }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<string | null | undefined>(undefined)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getChatAccess().then((access) => setUnavailable('reason' in access ? access.reason : null))
  }, [])

  async function send() {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    const access = await getChatAccess()
    if ('reason' in access) {
      setUnavailable(access.reason)
      setBusy(false)
      return
    }
    const history = turns
    setTurns([...history, { role: 'user', text }])
    setQuestion('')
    if (history.length === 0) onAsked?.()
    try {
      const reply = await askTutor(access.client, access.model, getContext(), history, text)
      await addUsage(reply.usage, sessionId)
      setTurns([...history, { role: 'user', text }, { role: 'assistant', text: reply.text }])
    } catch (err) {
      const usage = (err as { usage?: Usage }).usage
      if (usage) await addUsage(usage, sessionId)
      // Put the question back so it is not lost.
      setTurns(history)
      setQuestion(text)
      setError(`No reply: ${describeError(err)}.`)
    }
    setBusy(false)
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  if (unavailable === undefined) return <p className="muted">Loading…</p>
  if (unavailable) {
    return (
      <div className="notice">
        {unavailable} <Link to="/settings">Open Settings</Link>
      </div>
    )
  }

  return (
    <div data-testid="tutor-chat">
      {turns.map((turn, i) => (
        <div key={i} className={`bubble ${turn.role}`}>
          <div className="muted small">{turn.role === 'user' ? 'You' : 'Tutor'}</div>
          <div className="bubble-text">{turn.text}</div>
        </div>
      ))}
      {busy && <p className="muted">The tutor is thinking…</p>}
      {error && <div className="notice bad">{error}</div>}
      <div ref={endRef} />
      <label htmlFor="tutor-question" className="muted">
        Your question
      </label>
      <textarea
        id="tutor-question"
        rows={2}
        style={{ minHeight: 60 }}
        placeholder={placeholder}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" onClick={send} disabled={busy || !question.trim()}>
          {busy ? 'Sending…' : 'Ask'}
        </button>
        {turns.length > 0 && !busy && (
          <button type="button" className="quiet" onClick={() => setTurns([])}>
            Clear conversation
          </button>
        )}
      </div>
    </div>
  )
}
