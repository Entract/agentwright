// What a program run with the PC's Python has printed so far, and the line for typing into it.
// Kept apart from the Scratchpad so that other sections can show a PC run without loading it.
import { useEffect, useRef, useState } from 'react'

/** Most text kept from one PC run, so a runaway print loop cannot fill memory. */
const MAX_OUTPUT = 400_000

export interface Chunk {
  kind: 'out' | 'err' | 'in'
  text: string
}
export interface PcRun {
  chunks: Chunk[]
  size: number
  truncated: boolean
  done: null | { code?: number; stopped?: boolean; ms?: number; problem?: string }
}

export const emptyPcRun = (): PcRun => ({ chunks: [], size: 0, truncated: false, done: null })

export function addChunk(run: PcRun, kind: Chunk['kind'], text: string): PcRun {
  if (run.truncated) return run
  const room = MAX_OUTPUT - run.size
  const piece = text.length > room ? text.slice(0, room) : text
  const last = run.chunks[run.chunks.length - 1]
  const chunks = last && last.kind === kind ? [...run.chunks.slice(0, -1), { kind, text: last.text + piece }] : [...run.chunks, { kind, text: piece }]
  return { ...run, chunks, size: run.size + piece.length, truncated: text.length > room }
}

export function PcOutput({ run, onInput, quiet = false }: { run: PcRun; onInput: (text: string) => void; quiet?: boolean }) {
  const [line, setLine] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [run])
  const { done } = run
  return (
    <div data-testid="pc-output">
      {run.chunks.length > 0 && (
        <pre className="code output pc-stream">
          {run.chunks.map((c, i) => (
            <span key={i} className={`stream-${c.kind}`}>
              {c.text}
            </span>
          ))}
        </pre>
      )}
      {run.truncated && <p className="muted small">Output cut off: the program printed more than this window keeps.</p>}
      {!done && quiet && <p className="muted small">Running…</p>}
      {!done && !quiet && (
        <form
          className="row pc-input"
          onSubmit={(e) => {
            e.preventDefault()
            onInput(line)
            setLine('')
          }}
        >
          <input
            type="text"
            className="mono"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Running… type here and press Enter if the program asks for input"
            aria-label="Input for the running program"
            spellCheck={false}
          />
        </form>
      )}
      {done && (
        <p className={`small ${done.problem || (done.code && !done.stopped) ? 'pc-bad' : 'muted'}`} data-testid="pc-status">
          {done.problem
            ? done.problem
            : done.stopped
              ? 'Stopped.'
              : done.code
                ? `Ended with an error (exit code ${done.code}) after ${((done.ms ?? 0) / 1000).toFixed(1)} s.`
                : `${run.chunks.length === 0 ? 'The program ran and printed nothing. ' : ''}Finished in ${((done.ms ?? 0) / 1000).toFixed(1)} s.`}
        </p>
      )}
      <div ref={end} />
    </div>
  )
}
