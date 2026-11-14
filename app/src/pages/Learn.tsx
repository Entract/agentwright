import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ExerciseView, { type ExerciseOutcome } from '../components/ExerciseView'
import SessionSummary from '../components/SessionSummary'
import { db, getSetting } from '../db/db'
import { nextExercises, type StartLevel } from '../learn/queue'
import {
  allExercises,
  endSession,
  ensureSeeded,
  getActiveSession,
  saveActiveSession,
  startSession,
  type ActiveSession,
} from '../learn/store'
import type { Exercise } from '../types'

const SESSION_LENGTH = 5

export default function Learn() {
  const [exercises, setExercises] = useState<Exercise[] | null>(null)
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [upNext, setUpNext] = useState<Exercise[]>([])
  const [summaryId, setSummaryId] = useState<number | null>(null)

  async function load() {
    await ensureSeeded()
    const [all, session, attempts, level] = await Promise.all([
      allExercises(),
      getActiveSession(),
      db.attempts.toArray(),
      getSetting<StartLevel>('startLevel', 'frontier'),
    ])
    setExercises(all)
    setActive(session && session.index < session.exerciseIds.length ? session : null)
    setUpNext(nextExercises(all, attempts, level, SESSION_LENGTH))
  }

  useEffect(() => {
    load()
  }, [])

  if (!exercises) return <section className="page"><p className="muted">Loading…</p></section>

  if (summaryId !== null) {
    return (
      <section className="page">
        <SessionSummary
          sessionId={summaryId}
          exercises={exercises}
          onClose={() => {
            setSummaryId(null)
            load()
          }}
        />
      </section>
    )
  }

  async function finish(session: ActiveSession) {
    await endSession(session.id)
    setActive(null)
    setSummaryId(session.id)
  }

  async function advance(session: ActiveSession, outcome: ExerciseOutcome) {
    const cardIds = outcome.card && !session.cardIds.includes(outcome.card.id) ? [...session.cardIds, outcome.card.id] : session.cardIds
    const next = { ...session, index: session.index + 1, cardIds }
    await saveActiveSession(next)
    if (next.index >= next.exerciseIds.length) await finish(next)
    else setActive(next)
  }

  if (!active) {
    return (
      <section className="page">
        <h1>Continue learning</h1>
        {upNext.length === 0 ? (
          <p className="muted">There are no exercises to practise.</p>
        ) : (
          <>
            <p>One question at a time. A session is {upNext.length} questions; you can stop whenever you like.</p>
            <div className="card">
              <div className="muted">Up next</div>
              <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                {upNext.map((e) => (
                  <li key={e.id}>
                    {e.title} <span className="muted">({e.mode})</span>
                  </li>
                ))}
              </ol>
            </div>
            <button
              className="primary"
              onClick={async () => setActive(await startSession('learn', upNext.map((e) => e.id)))}
            >
              Start session
            </button>
          </>
        )}
        <p className="muted" style={{ marginTop: 16 }}>
          To pick a specific exercise, go to <Link to="/lab">Write</Link> or the <Link to="/map">course map</Link>.
        </p>
      </section>
    )
  }

  const exercise = exercises.find((e) => e.id === active.exerciseIds[active.index])
  if (!exercise) {
    // The exercise was removed, for example by an import.
    return (
      <section className="page">
        <p>This exercise is no longer available.</p>
        <button className="primary" onClick={() => finish(active)}>
          End session
        </button>
      </section>
    )
  }
  const last = active.index === active.exerciseIds.length - 1

  return (
    <section className="page">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <span className="muted">
          Question {active.index + 1} of {active.exerciseIds.length}
        </span>
        <button className="quiet" style={{ minHeight: 36, padding: '4px 10px' }} onClick={() => finish(active)}>
          End session
        </button>
      </div>
      <ExerciseView
        key={`${active.id}-${exercise.id}`}
        exercise={exercise}
        sessionId={active.id}
        nextLabel={last ? 'Finish session' : 'Next question'}
        onNext={(outcome) => advance(active, outcome)}
      />
    </section>
  )
}
