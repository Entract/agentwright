import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Guided from './Guided'
import Agents from '../agents/Agents'
import { sendToHost } from './host'
import Scratchpad from './Scratchpad'
import Revision, { type RevisionStorage } from '../revision/Revision'
import { saveTextFile } from '../db/files'
import '../styles.css'
import './desktop.css'

type View = 'scratch' | 'course' | 'revision' | 'agents'
const VIEW_KEY = 'scratchpad-view'

function initialView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    return saved === 'course' || saved === 'revision' || saved === 'agents' ? saved : 'scratch'
  } catch {
    return 'scratch'
  }
}

const REVISION_KEY = 'revision-store'
/** Revision sets and their history are kept in this window's own storage. Each set can be exported as a file. */
const revisionStorage: RevisionStorage = {
  load: async () => localStorage.getItem(REVISION_KEY),
  save: async (text) => localStorage.setItem(REVISION_KEY, text),
}

/** Three modes in one window: the free-form scratchpad and the guided course. Both stay loaded, so neither loses its state. */
function App() {
  const [view, setView] = useState<View>(initialView)

  function choose(next: View) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Not remembered; nothing else depends on it.
    }
    // The course shows the task beside the editor, so it asks for a wider window.
    if (next === 'course' || next === 'agents') sendToHost({ type: 'size', width: 1180, height: 760 })
    // A code question in Revision has a panel on each side of the editor.
    if (next === 'revision') sendToHost({ type: 'size', width: 1440, height: 820 })
  }

  return (
    <div className="shell">
      <nav className="modes" aria-label="Mode">
        <button className={view === 'scratch' ? 'mode active' : 'mode'} onClick={() => choose('scratch')}>
          Scratchpad
        </button>
        <button className={view === 'course' ? 'mode active' : 'mode'} onClick={() => choose('course')}>
          Guided course
        </button>
        <button className={view === 'revision' ? 'mode active' : 'mode'} onClick={() => choose('revision')}>
          Revision
        </button>
        <button className={view === 'agents' ? 'mode active' : 'mode'} onClick={() => choose('agents')}>
          My Agents
        </button>
      </nav>
      <div className="shell-body" hidden={view !== 'scratch'}>
        <Scratchpad active={view === 'scratch'} />
      </div>
      <div className="shell-body" hidden={view !== 'course'}>
        <Guided active={view === 'course'} />
      </div>
      <div className="shell-body" hidden={view !== 'agents'}>
        <Agents />
      </div>
      <div className="shell-body" hidden={view !== 'revision'}>
        <div className="rev-scroll">
          <Revision storage={revisionStorage} saveFile={saveTextFile} wide />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
