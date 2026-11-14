import { Link } from 'react-router-dom'
import TutorChat from '../components/TutorChat'

const context = { solutionSeen: true }

/** General questions for the AI tutor, not tied to an exercise. */
export default function Ask() {
  return (
    <section className="page">
      <Link to="/" className="link">‹ Home</Link>
      <h1>Ask the tutor</h1>
      <p className="muted">
        Ask anything about Python. To ask about a particular exercise, open it and use “Ask the tutor” there, so the tutor can see the code and your answer.
        Each question is sent to Claude and counts toward your daily spending limit. The conversation is not saved when you leave this screen.
      </p>
      <TutorChat getContext={() => context} placeholder="For example: why does b = a not copy a list?" />
    </section>
  )
}
