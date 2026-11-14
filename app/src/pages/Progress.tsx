import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { useLive } from '../db/useLive'
import { PRIORITY_MISCONCEPTIONS, topicById, topics } from '../content'
import { activitySummary, topicEvidence } from '../learn/mastery'
import { allExercises } from '../learn/store'
import { dueCards } from '../review/scheduler'

const OUTCOME = { correct: 'Correct', partial: 'Partly correct', incorrect: 'Not yet' } as const

/** Topics the multi-file project builds on, and the kind of evidence that matters for each. */
const PROJECT_NEEDS: { topicId: string; need: 'writeIndependent' | 'any' }[] = [
  { topicId: 'g-write-function', need: 'writeIndependent' },
  { topicId: 'g-loop-records', need: 'writeIndependent' },
  { topicId: 'e-exceptions', need: 'any' },
  { topicId: 'e-files', need: 'any' },
  { topicId: 'f-json', need: 'any' },
]

export default function Progress() {
  const data = useLive(async () => {
    const [exercises, attempts, cards, sessions] = await Promise.all([
      allExercises(),
      db.attempts.toArray(),
      db.cards.toArray(),
      db.sessions.toArray(),
    ])
    return { exercises, attempts, cards, sessions }
  })
  if (!data) return <section className="page"><p className="muted">Loading…</p></section>

  const now = Date.now()
  const { exercises, attempts, cards, sessions } = data
  const evidence = topicEvidence(topics, exercises, attempts, cards)
  const activity = activitySummary(attempts, sessions, now)
  const due = dueCards(cards, now, PRIORITY_MISCONCEPTIONS).length
  const byId = new Map(exercises.map((e) => [e.id, e]))

  const withExercises = new Set(exercises.flatMap((e) => e.topicIds))
  const unanswered = topics.filter((t) => withExercises.has(t.id) && evidence.get(t.id)!.attempts === 0)

  const best = new Map<string, (typeof attempts)[number]>()
  for (const a of attempts) {
    if (a.verdict === 'correct' && a.independent) {
      const prev = best.get(a.exerciseId)
      if (!prev || a.ts > prev.ts) best.set(a.exerciseId, a)
    }
  }

  const needs = PROJECT_NEEDS.map((n) => {
    const ev = evidence.get(n.topicId)!
    const c = ev.counts
    const met = n.need === 'writeIndependent' ? c.writeIndependent > 0 : c.explain + c.predict + c.writeHelped + c.writeIndependent > 0
    return { ...n, met, title: topicById.get(n.topicId)!.title }
  })
  const metCount = needs.filter((n) => n.met).length
  const recent = [...attempts].sort((a, b) => b.ts - a.ts).slice(0, 12)

  return (
    <section className="page">
      <Link to="/" className="link">‹ Home</Link>
      <h1>My progress</h1>

      <h2>Activity</h2>
      <table className="plain">
        <tbody>
          <tr><td>Answers in the last 7 days</td><td>{activity.attemptsThisWeek}</td></tr>
          <tr><td>Practice minutes in the last 7 days</td><td>{activity.minutesThisWeek}</td></tr>
          <tr><td>Practice minutes in total</td><td>{activity.minutesTotal}</td></tr>
          <tr><td>Review cards due</td><td>{due > 0 ? <Link to="/review">{due}</Link> : 0}</td></tr>
          <tr><td>Concept misses recorded</td><td>{activity.conceptMisses}</td></tr>
          <tr><td>Typing slips recorded (not counted against concepts)</td><td>{activity.slips}</td></tr>
        </tbody>
      </table>

      <h2>Ready for the readings project?</h2>
      <p className="muted">
        {metCount} of {needs.length} things it builds on have evidence. This is a checklist, not a score.
      </p>
      <ul>
        {needs.map((n) => (
          <li key={n.topicId}>
            <Link to={`/map/${n.topicId}`}>{n.title}</Link>:{' '}
            {n.met ? 'evidence recorded' : n.need === 'writeIndependent' ? 'no independently written solution yet' : 'no evidence yet'}
          </li>
        ))}
      </ul>

      <h2>Concepts with no answers yet</h2>
      {unanswered.length === 0 ? (
        <p className="muted">Every topic that has exercises has at least one answer.</p>
      ) : (
        <p>
          {unanswered.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ', '}
              <Link to={`/map/${t.id}`}>{t.title}</Link>
            </span>
          ))}
        </p>
      )}

      <h2>Best independent solutions</h2>
      {best.size === 0 ? (
        <p className="muted">None yet. A solution counts as independent when it is written with no starter code, hints or reveal.</p>
      ) : (
        [...best.values()].sort((a, b) => b.ts - a.ts).map((a) => (
          <details key={a.id} className="card">
            <summary>
              {byId.get(a.exerciseId)?.title} <span className="muted">· {new Date(a.ts).toLocaleDateString()}</span>
            </summary>
            <pre className="code" style={{ marginTop: 8 }}>{a.submitted}</pre>
          </details>
        ))
      )}

      <h2>Recent answers</h2>
      {recent.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <table className="plain">
          <tbody>
            {recent.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.ts).toLocaleDateString()}</td>
                <td><Link to={`/lab/${a.exerciseId}`}>{byId.get(a.exerciseId)?.title ?? a.exerciseId}</Link></td>
                <td><span className={`verdict ${a.verdict}`}>{OUTCOME[a.verdict]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
