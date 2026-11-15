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
