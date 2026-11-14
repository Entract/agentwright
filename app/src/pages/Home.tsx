import { Link, useNavigate } from 'react-router-dom'
import { db, getSetting, setSetting } from '../db/db'
import { useLive } from '../db/useLive'
import { PRIORITY_MISCONCEPTIONS } from '../content'
import { nextExercises, type StartLevel } from '../learn/queue'
import { allExercises, getActiveSession, startSession } from '../learn/store'
import { dueCards } from '../review/scheduler'

function Welcome({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()

  async function choose(level: StartLevel, quickCheck: boolean) {
    await setSetting('startLevel', level)
    await setSetting('welcomed', true)
    if (quickCheck) {
      const ids = (await allExercises()).filter((e) => e.diagnostic).map((e) => e.id)
      await startSession('diagnostic', ids)
      navigate('/learn')
    } else onDone()
  }

  return (
    <section className="page">
      <h1>Welcome back to Python</h1>
      <p>
        This app picks up where your tutoring conversation stopped. It assumes you can already read loops, conditions and functions, and that the next step is
        writing them yourself.
      </p>
      <ul>
        <li><strong>Continue</strong> with independent function writing, starting at count_high.</li>
        <li><strong>Review</strong> list identity: two names for one list.</li>
        <li><strong>Course map</strong> of the Python fundamentals, with what has been practised.</li>
        <li><strong>Claude agent lab</strong>, marked for later.</li>
      </ul>
      <p className="muted">Is that starting point right? You can change it later in Settings.</p>
      <div className="menu">
        <button className="primary" onClick={() => choose('frontier', false)}>
          Yes, start at count_high
        </button>
        <button onClick={() => choose('frontier', true)}>Check me first (3 quick questions)</button>
        <button onClick={() => choose('fundamentals', false)}>Start from the fundamentals instead</button>
      </div>
    </section>
  )
}

export default function Home() {
  const data = useLive(async () => {
    const [welcomed, level, exercises, attempts, cards, active] = await Promise.all([
      getSetting('welcomed', false),
      getSetting<StartLevel>('startLevel', 'frontier'),
      allExercises(),
      db.attempts.toArray(),
      db.cards.toArray(),
      getActiveSession(),
    ])
    return {
      welcomed,
      next: nextExercises(exercises, attempts, level, 1)[0],
      due: dueCards(cards, Date.now(), PRIORITY_MISCONCEPTIONS).length,
      inSession: !!active && active.index < active.exerciseIds.length,
    }
  })

  if (!data) return <section className="page"><p className="muted">Loading…</p></section>
  if (!data.welcomed) return <Welcome onDone={() => undefined} />

  const main = [
    { to: '/revision', title: 'Revision', note: 'Question sets from your mentor, with the mentor as judge' },
    { to: '/course', title: 'Agent course', note: 'The PC course: tool use, agent loops, your own agent' },
    { to: '/lab/scratch', title: 'Scratchpad', note: 'Write and run any Python, including calls to Claude' },
  ]
  // The first version of this app: practice in Python basics. Kept, but out of the way.
  const earlier = [
    {
      to: '/learn',
      title: 'Continue learning',
      note: data.inSession ? 'A session is in progress' : data.next ? `Next: ${data.next.title}` : 'All exercises answered once',
    },
    { to: '/review', title: 'Review due', note: data.due === 0 ? 'Nothing due' : `${data.due} card${data.due > 1 ? 's' : ''} due` },
    { to: '/lab', title: 'Writing exercises', note: 'Short functions, checked by tests' },
    { to: '/ask', title: 'Ask the tutor', note: 'Type a Python question (needs the AI tutor)' },
    { to: '/map', title: 'Course map', note: 'Topics and evidence' },
    { to: '/progress', title: 'My progress', note: 'Activity and attempts' },
  ]

  return (
    <section className="page">
      <header className="page-head">
        <h1>Python Learning Lab</h1>
        <Link to="/settings" className="link">Settings</Link>
      </header>
      <ul className="menu">
        {main.map((e) => (
          <li key={e.to}>
            <Link to={e.to} className="menu-item">
              <span className="menu-title">{e.title}</span>
              <span className="muted">{e.note}</span>
            </Link>
          </li>
        ))}
      </ul>
      <details className="home-earlier">
        <summary>Python basics practice ({earlier.length})</summary>
        <ul className="menu">
          {earlier.map((e) => (
            <li key={e.to}>
              <Link to={e.to} className="menu-item">
                <span className="menu-title">{e.title}</span>
                <span className="muted">{e.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
