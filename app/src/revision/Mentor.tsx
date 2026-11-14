// Ask Mentor: a chat with Claude about the code question on screen. PC window only: the call is
// made by the window's host, which holds the API key. The mentor reads the learner's work and
// replies in this panel; it has no way to change the code.
import { useEffect, useRef, useState } from 'react'
import { onHostMessage, sendToHost } from '../desktop/host'
import type { Question } from './format'
import { LEVELS, MENTOR_SYSTEM, conversation, mentorMessage, readVerdict, replyParts, type Level, type MentorState, type Turn, type Verdict } from './mentorText'

/** Request numbers, so that a late reply to an earlier question is not shown under a later one. */
let mentorRequest = 0

interface Props {
  question: Extract<Question, { type: 'write' }>
  /** The learner's work at the moment of asking. */
  state: () => MentorState
  hasKey: boolean
  selection: string
  onClearSelection: () => void
  /** Called when the learner asks the mentor for the solution, which counts as having seen it. */
  onSolutionAsked: () => void
  onHide: () => void
  /** The panel stays loaded while hidden, so the conversation is kept. */
  open: boolean
  /** Goes up by one each time the learner presses "Ask the mentor to judge" beside the question. */
  judgeRequest: number
  /** Called when a "Judge it" reply ends, with its verdict (null if it gave none) and the reply. */
  onVerdict: (verdict: Verdict | null, reply: string) => void
  /** True once the mentor's latest verdict is "done": the panel then offers the way on. */
  passed: boolean
  onNext: () => void
  onAgain: () => void
  /** Goes up by one when the learner starts the question again, which empties the chat. */
  clearRequest: number
}

export default function Mentor({ question, state, hasKey, selection, onClearSelection, onSolutionAsked, onHide, open, judgeRequest, onVerdict, passed, onNext, onAgain, clearRequest }: Props) {
  const report = useRef(onVerdict)
  report.current = onVerdict
  const judging = useRef(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [level, setLevel] = useState<Level>('hint')
  const [typed, setTyped] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [problem, setProblem] = useState('')
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
        if (judging.current) {
          judging.current = false
          // Read from the finished reply, which is the last turn.
          setTurns((old) => {
            const last = old[old.length - 1]
            const ok = last?.role === 'assistant' && !m.problem && !m.stopped
            report.current(ok ? readVerdict(last.text) : null, ok ? last.text : '')
            return old
          })
        }
      }
    })
    return () => {
      off()
      if (request.current) sendToHost({ type: 'mentorStop' })
    }
  }, [])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [turns, waiting, passed])

  function ask(as: Level = level) {
    if (waiting || !hasKey) return
    const now = state()
    const asked = as === level ? typed : ''
    const shown = asked.trim() || LEVELS.find((l) => l.id === as)!.ask
    const turn: Turn = { role: 'user', text: shown, level: as, sent: mentorMessage(question, as, asked, { ...now, selection }) }
    const next = [...turns, turn]
    setTurns(next)
    if (as === level) setTyped('')
    setProblem('')
    setWaiting(true)
    if (as === 'solution') onSolutionAsked()
    judging.current = as === 'judge'
    const id = ++mentorRequest
    request.current = id
    sendToHost({ type: 'mentor', id, system: MENTOR_SYSTEM, messages: conversation(next) })
  }

  const judged = useRef(judgeRequest)
  useEffect(() => {
    if (judgeRequest === judged.current) return
    judged.current = judgeRequest
    setLevel('judge')
    ask('judge')
  }, [judgeRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const cleared = useRef(clearRequest)
  useEffect(() => {
    if (clearRequest === cleared.current) return
    cleared.current = clearRequest
    if (request.current) sendToHost({ type: 'mentorStop' })
    request.current = 0
    judging.current = false
    setWaiting(false)
    setTurns([])
    setProblem('')
    setLevel('hint')
  }, [clearRequest])

  const chosen = LEVELS.find((l) => l.id === level)!
  const lines = selection.trim() ? selection.replace(/\n$/, '').split('\n').length : 0

  return (
    <aside className="rev-mentor" data-testid="rev-mentor" hidden={!open}>
      <div className="row spread rev-mentor-top">
        <strong>Ask Mentor</strong>
        <button className="quiet" onClick={onHide} title="Hide the mentor panel">
          Hide ▸
        </button>
      </div>
      <div className="rev-mentor-talk" aria-live="polite">
        {turns.length === 0 && (
          <p className="muted small">
            Ask about this question without pasting anything. The mentor is sent the exercise, the code in your editor, the latest output and any code you have highlighted. It replies here and cannot change your code. Each message goes to
            Anthropic with your saved key and costs a small amount.
          </p>
        )}
        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div key={i} className="rev-mentor-you">
              <span className="muted small">You · {LEVELS.find((l) => l.id === turn.level)?.label}</span>
              <p>{turn.text}</p>
            </div>
          ) : (
            <div key={i} className="rev-mentor-reply">
              {replyParts(turn.text).map((part, n) => (part.code ? <pre key={n} className="code">{part.text}</pre> : <p key={n}>{part.text}</p>))}
            </div>
          ),
        )}
        {waiting && turns[turns.length - 1]?.role === 'user' && <p className="muted small">Thinking…</p>}
        {problem && <p className="rev-bad small">{problem}</p>}
        {passed && !waiting && (
          <div className="row rev-mentor-passed">
            <button className="primary" onClick={onNext}>
              Next question →
            </button>
            <button onClick={onAgain}>Do it again from the start</button>
          </div>
        )}
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
            <div className="row">
              <select value={level} onChange={(ev) => setLevel(ev.target.value as Level)} aria-label="How much help" disabled={waiting}>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              {lines > 0 && (
                <button className="quiet rev-mentor-chip" onClick={onClearSelection} title="The highlighted code is sent with your message. Click to leave it out.">
                  {lines} highlighted line{lines === 1 ? '' : 's'} ✕
                </button>
              )}
            </div>
            <p className="muted small">{chosen.note}</p>
            <textarea
              rows={3}
              value={typed}
              onChange={(ev) => setTyped(ev.target.value)}
              placeholder={`${chosen.ask} (or type your own question; Enter sends)`}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault()
                  ask()
                }
              }}
            />
            <div className="row">
              {waiting ? (
                <button onClick={() => sendToHost({ type: 'mentorStop' })}>Stop</button>
              ) : (
                <button className="primary" onClick={() => ask()}>
                  {typed.trim() ? 'Send' : level === 'hint' ? 'Get a hint' : chosen.label}
                </button>
              )}
              {turns.length > 0 && !waiting && (
                <button className="quiet" onClick={() => { setTurns([]); setProblem('') }} title="Starts the conversation again for this question">
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
