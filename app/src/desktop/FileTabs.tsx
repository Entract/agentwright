// The row of file tabs above an editor: used by the Scratchpad (files in the working folder)
// and by My Agents (the files one agent owns).
import { useState } from 'react'
import { fileName } from './files'

interface Props {
  names: string[]
  /** The file showing in the editor. '' is the scratch tab, where there is one. */
  shown: string
  onPick: (name: string) => void
  /** Called with a checked, unused name. */
  onCreate: (name: string) => void
  onRemove: (name: string) => void
  /** The Scratchpad's first tab: one program that is not a file. */
  scratch?: boolean
  /** My Agents: the script that runs when the agent starts. It is marked, and cannot be removed. */
  main?: string
  /** A message from outside, such as a file that could not be saved. */
  note?: string
  newTitle?: string
}

export default function FileTabs({ names, shown, onPick, onCreate, onRemove, scratch = false, main, note = '', newTitle = 'New file' }: Props) {
  const [naming, setNaming] = useState<string | null>(null)
  const [problem, setProblem] = useState('')

  function close() {
    setNaming(null)
    setProblem('')
  }

  function create() {
    const checked = fileName(naming ?? '', names)
    if (checked.problem !== undefined) {
      setProblem(checked.problem)
      return
    }
    close()
    onCreate(checked.name)
  }

  return (
    <div className="pad-tabs" data-testid="pad-tabs">
      {scratch && (
        <span className={shown ? 'pad-tab' : 'pad-tab on'}>
          <button role="tab" aria-selected={!shown} onClick={() => { close(); onPick('') }} title="One program kept inside this app. It is not a file, so other files cannot import it.">
            scratch
          </button>
        </span>
      )}
      {names.map((name) => (
        <span key={name} className={name === shown ? 'pad-tab on' : 'pad-tab'}>
          <button role="tab" aria-selected={name === shown} onClick={() => { close(); onPick(name) }} title={name === main ? `${name}: the script that runs when the agent starts` : name}>
            {name === main && <span className="pad-tab-main" aria-label="runs first">▶ </span>}
            {name}
          </button>
          {name === shown && name !== main && (
            <button className="pad-tab-x" onClick={() => onRemove(name)} title="Remove this file (it goes to the Recycle Bin)" aria-label={`Remove ${name}`}>
              ×
            </button>
          )}
        </span>
      ))}
      {naming === null ? (
        <button className="quiet pad-tab-new" onClick={() => setNaming('')} title={newTitle}>
          + New file
        </button>
      ) : (
        <form
          className="pad-tab-form"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <input
            autoFocus
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
            }}
            placeholder="tools.py or schedule.json"
            aria-label="Name of the new file"
            spellCheck={false}
          />
          <button type="submit">Create</button>
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
        </form>
      )}
      {(problem || note) && (
        <span className="rev-bad small pad-tab-note" data-testid="pad-file-note">
          {problem || note}
        </span>
      )}
    </div>
  )
}
