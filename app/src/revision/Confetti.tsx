// A short burst of confetti over the window, shown once when a question is passed.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

const COLOURS = ['#e4572e', '#f3a712', '#29a37a', '#2e86de', '#a05ce0', '#e84393']
const PIECES = 70
const LASTS_MS = 2600

export default function Confetti() {
  const [shown, setShown] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setShown(false), LASTS_MS)
    return () => clearTimeout(timer)
  }, [])
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        time: 1.4 + Math.random() * 1.1,
        drift: (Math.random() - 0.5) * 240,
        turn: 360 + Math.random() * 720,
        size: 6 + Math.random() * 6,
        colour: COLOURS[i % COLOURS.length],
      })),
    [],
  )
  if (!shown) return null
  return (
    <div className="rev-confetti" aria-hidden="true" data-testid="rev-confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.5,
              background: p.colour,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.time}s`,
              '--drift': `${p.drift}px`,
              '--turn': `${p.turn}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
