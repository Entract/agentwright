import { Link, Route, Routes, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { useLive } from '../db/useLive'
import { misconceptions, modules, topicById, topics } from '../content'
import { evidenceStrength, initialNote, STATES, topicEvidence, type TopicEvidence } from '../learn/mastery'
import { allExercises } from '../learn/store'
import { statusOf } from './Lab'
import type { Attempt, Exercise, ReviewCard } from '../types'

interface Data {
  exercises: Exercise[]
  attempts: Attempt[]
  cards: ReviewCard[]
  evidence: Map<string, TopicEvidence>
}

function useData(): Data | undefined {
  return useLive(async () => {
    const [exercises, attempts, cards] = await Promise.all([allExercises(), db.attempts.toArray(), db.cards.toArray()])
    return { exercises, attempts, cards, evidence: topicEvidence(topics, exercises, attempts, cards) }
  })
}

/** Evidence shown as counts per state. No percentages. */
function EvidenceChips({ ev }: { ev: TopicEvidence }) {
  const shown = STATES.filter((s) => s.key !== 'introduced' && ev.counts[s.key] > 0)
  if (shown.length === 0) return null
  return (
    <span className="row" style={{ gap: 6, marginTop: 4 }}>
      {shown.map((s) => (
        <span key={s.key} className="tag soft" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {s.label} · {ev.counts[s.key]}
        </span>
      ))}
    </span>
  )
}

function MapList() {
  const data = useData()
  if (!data) return <p className="muted">Loading…</p>
  return (
    <>
      <h1>Course map</h1>
      <p className="muted">
        Each topic lists the evidence recorded for it, as counts of distinct exercises or spaced reviews. Reading and writing are tracked separately.
      </p>
      {modules.map((m) => (
        <div key={m.id}>
          <h2>
            {m.id}. {m.title}
          </h2>
          <p className="muted">Starting position: {m.position}</p>
          <ul className="menu">
            {topics
              .filter((t) => t.module === m.id)
              .map((t) => {
                const ev = data.evidence.get(t.id)!
                const hasEvidence = STATES.some((s) => s.key !== 'introduced' && ev.counts[s.key] > 0)
                return (
                  <li key={t.id}>
                    <Link to={t.id} className="menu-item" style={t.initialStatus === 'later' ? { opacity: 0.6 } : undefined}>
                      <span className="menu-title">{t.title}</span>
                      {hasEvidence ? <EvidenceChips ev={ev} /> : <span className="muted">{ev.attempts > 0 ? 'Attempted; nothing answered correctly yet.' : initialNote(t)}</span>}
                    </Link>
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
    </>
  )
}

const OUTCOME = { correct: 'Correct', partial: 'Partly correct', incorrect: 'Not yet' } as const

function TopicDetail() {
  const { id } = useParams()
  const data = useData()
  const topic = topicById.get(id ?? '')
  if (!topic) return <p>That topic does not exist.</p>
  if (!data) return <p className="muted">Loading…</p>
  const ev = data.evidence.get(topic.id)!
  const exercises = data.exercises.filter((e) => e.topicIds.includes(topic.id))
  const ids = new Set(exercises.map((e) => e.id))
  const ledger = data.attempts.filter((a) => ids.has(a.exerciseId)).sort((a, b) => b.ts - a.ts)
  const related = misconceptions.filter((m) => m.topicId === topic.id)
  const title = new Map(exercises.map((e) => [e.id, e.title]))

  return (
    <>
      <Link to="/map" className="link">‹ Course map</Link>
      <h1>{topic.title}</h1>
      <p>{topic.explanation}</p>
      <p className="muted">Goal: {topic.objective}</p>
      {topic.prerequisites.length > 0 && (
        <p className="muted">
          Builds on:{' '}
          {topic.prerequisites.map((p, i) => (
            <span key={p}>
              {i > 0 && ', '}
              <Link to={`/map/${p}`}>{topicById.get(p)?.title}</Link>
            </span>
          ))}
        </p>
      )}

      <h2>Evidence</h2>
      <table className="plain">
        <tbody>
          {STATES.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>
                {s.key === 'introduced'
                  ? ev.counts.introduced > 0 ? 'Yes' : 'Not yet'
                  : `${ev.counts[s.key]} (${evidenceStrength(ev.counts[s.key])})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 8 }}>
        {ev.attempts} attempt{ev.attempts === 1 ? '' : 's'} recorded: {ev.conceptMisses} concept miss{ev.conceptMisses === 1 ? '' : 'es'}, {ev.slips} typing slip
        {ev.slips === 1 ? '' : 's'}. {ev.attempts === 0 ? initialNote(topic) : ''}
      </p>

      {related.length > 0 && (
        <>
          <h2>Common misconceptions</h2>
          {related.map((m) => (
            <div key={m.id} className="card">
              <strong>{m.concept}</strong>
              <p className="muted">Mistaken assumption: {m.assumption}</p>
              <p>{m.explanation}</p>
            </div>
          ))}
        </>
      )}

      <h2>Exercises</h2>
      {exercises.length === 0 ? (
        <p className="muted">No exercises yet.</p>
      ) : (
        <ul className="menu">
          {exercises.map((e) => (
            <li key={e.id}>
              <Link to={`/lab/${e.id}`} className="menu-item">
                <span className="menu-title">
                  {e.title} <span className="muted">({e.mode})</span>
                </span>
                <span className="muted">{statusOf(e, data.attempts)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Evidence ledger</h2>
      {ledger.length === 0 ? (
        <p className="muted">No attempts yet.</p>
      ) : (
        <table className="plain">
          <thead>
            <tr>
              <th>When</th>
              <th>Exercise</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {ledger.slice(0, 30).map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.ts).toLocaleDateString()}</td>
                <td>{title.get(a.exerciseId)}</td>
                <td>
                  <span className={`verdict ${a.verdict}`}>{OUTCOME[a.verdict]}</span>
                  <span className="muted">
                    {a.independent && a.verdict === 'correct' ? ' · independent' : ''}
                    {a.hintsUsed ? ` · ${a.hintsUsed} hint${a.hintsUsed > 1 ? 's' : ''}` : ''}
                    {a.revealed ? ' · after reveal' : ''}
                    {a.errorClass === 'syntax' || a.errorClass === 'typo' ? ' · typing slip' : ''}
                    {a.regrade === 'misread' ? ' · misread' : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

export default function CourseMap() {
  return (
    <section className="page">
      <Routes>
        <Route index element={<MapList />} />
        <Route path=":id" element={<TopicDetail />} />
      </Routes>
    </section>
  )
}
