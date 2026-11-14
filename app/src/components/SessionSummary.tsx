import { useEffect, useState } from 'react'
import { db, getSetting } from '../db/db'
import { topicById } from '../content'
import { nextExercises, type StartLevel } from '../learn/queue'
import type { Attempt, Exercise, ReviewCard, Session } from '../types'

interface Props {
  sessionId: number
  exercises: Exercise[]
  onClose: () => void
}

interface Loaded {
  session: Session
  attempts: Attempt[]
  cards: ReviewCard[]
  next: Exercise | undefined
}

const OUTCOME = { correct: 'Correct', partial: 'Partly correct', incorrect: 'Not yet' } as const

function describe(attempts: Attempt[]): string {
  if (attempts.length === 0) return 'Not answered'
  const final = attempts[attempts.length - 1]
  const parts: string[] = [OUTCOME[final.verdict]]
  parts.push(attempts.length === 1 ? 'first try' : `${attempts.length} tries`)
  const hints = Math.max(...attempts.map((a) => a.hintsUsed))
  if (hints > 0) parts.push(`${hints} hint${hints > 1 ? 's' : ''}`)
  if (attempts.some((a) => a.revealed)) parts.push('solution revealed')
  if (final.verdict === 'correct' && final.independent) parts.push('written independently')
  const slips = attempts.filter((a) => a.errorClass === 'syntax' || a.errorClass === 'typo').length
  if (slips > 0) parts.push(`${slips} typing slip${slips > 1 ? 's' : ''}`)
  return parts.join(', ')
}

/** End-of-session view: what was practised, the evidence, review cards added and what comes next. */
export default function SessionSummary({ sessionId, exercises, onClose }: Props) {
  const [data, setData] = useState<Loaded | null>(null)
  const [reflection, setReflection] = useState('')

  useEffect(() => {
    ;(async () => {
      const session = await db.sessions.get(sessionId)
      if (!session) return
      const [attempts, all, level] = await Promise.all([
        db.attempts.where('sessionId').equals(sessionId).sortBy('ts'),
        db.attempts.toArray(),
        getSetting<StartLevel>('startLevel', 'frontier'),
      ])
      const cards = (await db.cards.bulkGet(session.cardIds ?? [])).filter((c): c is ReviewCard => !!c)
      setReflection(session.reflections ?? '')
      setData({ session, attempts, cards, next: nextExercises(exercises, all, level, 1)[0] })
    })()
  }, [sessionId, exercises])

  if (!data) return <p className="muted">Loading…</p>

  const byId = new Map(exercises.map((e) => [e.id, e]))
  const attempted = data.session.exerciseIds.filter((id) => data.attempts.some((a) => a.exerciseId === id))
  const topicIds = [...new Set(attempted.flatMap((id) => byId.get(id)?.topicIds ?? []))]
  const minutes = Math.max(1, Math.round(((data.session.endedAt ?? Date.now()) - data.session.startedAt) / 60000))

  return (
    <div>
      <h1>Session summary</h1>
      <p className="muted">
        {attempted.length} of {data.session.exerciseIds.length} questions answered in about {minutes} minute{minutes > 1 ? 's' : ''}.
      </p>

      <h2>Evidence</h2>
      <table className="plain">
        <tbody>
          {data.session.exerciseIds.map((id) => {
            const exercise = byId.get(id)
            return (
              <tr key={id}>
                <td>
                  {exercise?.title ?? id} <span className="muted">({exercise?.mode})</span>
                </td>
                <td>{describe(data.attempts.filter((a) => a.exerciseId === id))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2>Concepts practised</h2>
      {topicIds.length === 0 ? (
        <p className="muted">None this time.</p>
      ) : (
        <ul>
          {topicIds.map((id) => (
            <li key={id}>{topicById.get(id)?.title ?? id}</li>
          ))}
        </ul>
      )}

      <h2>Review cards added or brought forward</h2>
      {data.cards.length === 0 ? (
        <p className="muted">None. No concept was missed in this session.</p>
      ) : (
        <ul>
          {data.cards.map((c) => (
            <li key={c.id}>{c.front}</li>
          ))}
        </ul>
      )}

      <h2>Next suggestion</h2>
      <p>{data.next ? `${data.next.title} (${data.next.mode})` : 'Everything has been answered correctly once. Review due cards to check it has stuck.'}</p>

      <label htmlFor="reflection">Anything to note for next time? (optional)</label>
      <textarea
        id="reflection"
        rows={2}
        value={reflection}
        onChange={(e) => setReflection(e.target.value)}
        onBlur={() => db.sessions.update(sessionId, { reflections: reflection })}
      />

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
