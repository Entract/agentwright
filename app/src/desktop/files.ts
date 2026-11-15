// Names for the Scratchpad's file tabs. The host program applies its own check as well.

/** Standard-library and package names a learner is likely to import. A file with one of these names would be imported instead. */
const TAKEN = new Set([
  'anthropic', 'calendar', 'code', 'collections', 'copy', 'csv', 'dataclasses', 'datetime', 'email', 'enum', 'io', 'json', 'logging', 'math', 'os', 'pathlib',
  'random', 're', 'string', 'sys', 'test', 'time', 'types', 'typing', 'unittest',
])

export type NameCheck = { name: string; problem?: undefined } | { name?: undefined; problem: string }

/** Turns what was typed into a file name, or says why it cannot be used. A name without an ending becomes a .py file. */
export function fileName(typed: string, existing: string[]): NameCheck {
  let name = typed.trim()
  if (!name) return { problem: 'Type a name for the file.' }
  if (!/\.[A-Za-z0-9]+$/.test(name)) name += '.py'
  if (name.length > 80 || !/^[A-Za-z0-9_][A-Za-z0-9_ .-]*\.(py|json|txt|csv|md)$/i.test(name)) {
    return { problem: 'Use letters, digits and underscores, ending in .py, .json, .txt, .csv or .md.' }
  }
  if (existing.some((other) => other.toLowerCase() === name.toLowerCase())) return { problem: `There is already a file called ${name}.` }
  if (/\.py$/i.test(name)) {
    const stem = name.slice(0, -3)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(stem)) {
      return { problem: 'A Python file needs a name made of letters, digits and underscores, not starting with a digit, or "import" cannot find it.' }
    }
    if (TAKEN.has(stem.toLowerCase())) {
      return { problem: `Python already has a module called ${stem}. A file with that name would be imported in its place, and "import ${stem}" would stop working. Choose another name, such as my_${stem}.py.` }
    }
  }
  return { name }
}

/** The Python file Run starts: the tab showing if it is Python, otherwise the last Python tab used ('' is the scratch tab). */
export function runTarget(shown: string, lastPython: string, names: string[]): string {
  if (!shown || /\.py$/i.test(shown)) return shown
  return names.includes(lastPython) ? lastPython : ''
}

/**
 * The other files a program appears to use: modules it imports (and what those import), and
 * any file whose name is written in the code, such as "schedule.json". A guess, offered as
 * the ticked boxes when a program is saved as an agent; the learner has the last word.
 */
export function usedFiles(code: string, files: Record<string, string>): string[] {
  const names = Object.keys(files)
  const found = new Set<string>()
  const queue = [code]
  while (queue.length) {
    const text = queue.pop()!
    const imported = new Set<string>()
    for (const line of text.split('\n')) {
      const plain = /^\s*import\s+(.+)$/.exec(line)
      if (plain) for (const part of plain[1].split(',')) imported.add(part.trim().split(/[\s.]/)[0])
      const from = /^\s*from\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line)
      if (from) imported.add(from[1])
    }
    for (const name of names) {
      if (found.has(name)) continue
      const isPython = /\.py$/i.test(name)
      if (isPython ? imported.has(name.slice(0, -3)) : text.includes(name)) {
        found.add(name)
        if (isPython) queue.push(files[name])
      }
    }
  }
  return names.filter((name) => found.has(name))
}
