import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

const MIN = 0.15
const MAX = 0.9

function clamp(share: number): number {
  return Math.min(MAX, Math.max(MIN, share))
}

function load(key: string, initial: number): number {
  try {
    const saved = Number(localStorage.getItem(key))
    return saved >= MIN && saved <= MAX ? saved : initial
  } catch {
    return initial
  }
}

/**
 * A draggable divider between an upper pane (the editor) and a lower one (the output).
 * `share` is the upper pane's part of the height the two have between them; it is
 * remembered under `key`. Give `upper` and `lower` to the two panes as their style.
 */
export function useDivider(key: string, initial = 0.6) {
  const [share, setShare] = useState(() => load(key, initial))
  const handle = useRef<HTMLDivElement>(null)

  const set = useCallback((next: number) => {
    const value = clamp(next)
    setShare(value)
    try {
      localStorage.setItem(key, String(value))
    } catch {
      // The position is a convenience; without storage it simply is not remembered.
    }
  }, [key])

  const drag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const bar = handle.current
    if (!bar || !bar.hasPointerCapture(event.pointerId)) return
    const upper = bar.previousElementSibling
    const lower = bar.parentElement?.lastElementChild
    if (!upper || !lower) return
    const top = upper.getBoundingClientRect().top
    const both = upper.getBoundingClientRect().height + lower.getBoundingClientRect().height
    if (both > 0) set((event.clientY - top) / both)
  }, [set])

  const keys = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') set(share - 0.05)
    else if (event.key === 'ArrowDown') set(share + 0.05)
    else if (event.key === 'Home') set(initial)
    else return
    event.preventDefault()
  }, [set, share, initial])

  const upper: CSSProperties = { flex: `${share} 1 0` }
  const lower: CSSProperties = { flex: `${1 - share} 1 0` }

  const divider = (
    <div
      ref={handle}
      className="divider"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize editor and output"
      aria-valuemin={Math.round(MIN * 100)}
      aria-valuemax={Math.round(MAX * 100)}
      aria-valuenow={Math.round(share * 100)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
      onPointerMove={drag}
      onDoubleClick={() => set(initial)}
      onKeyDown={keys}
    />
  )

  return { divider, upper, lower }
}
