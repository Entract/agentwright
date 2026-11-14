import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Learn from './pages/Learn'
import Review from './pages/Review'
import Lab from './pages/Lab'
import CourseMap from './pages/CourseMap'
import Progress from './pages/Progress'
import Settings from './pages/Settings'
import Ask from './pages/Ask'
import Course from './pages/Course'
import Revision from './pages/Revision'

const tabs = [
  { to: '/', label: 'Home', end: true },
  { to: '/revision', label: 'Revision' },
  { to: '/course', label: 'Course' },
  { to: '/lab/scratch', label: 'Scratchpad' },
]

export default function App() {
  return (
    <div className="app">
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn/*" element={<Learn />} />
          <Route path="/review/*" element={<Review />} />
          <Route path="/lab/*" element={<Lab />} />
          <Route path="/map/*" element={<CourseMap />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/course" element={<Course />} />
          <Route path="/revision" element={<Revision />} />
        </Routes>
      </main>
      <nav className="tabs" aria-label="Main">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
