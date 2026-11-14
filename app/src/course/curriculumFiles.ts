// The guided course's Python files (checker, tests, answer key, manifest), loaded only when
// Python is first needed. They are the same files the PC app runs.
const sources = import.meta.glob(['../../../desktop/curriculum/*.py', '../../../desktop/curriculum/manifest.json', '!**/test_*.py'], { query: '?raw', import: 'default' })

let loaded: Promise<Record<string, string>> | null = null

export function curriculumFiles(): Promise<Record<string, string>> {
  if (!loaded) {
    loaded = Promise.all(
      Object.entries(sources).map(async ([path, load]) => [path.slice(path.lastIndexOf('/') + 1), (await load()) as string] as const),
    ).then((entries) => Object.fromEntries(entries))
    loaded.catch(() => {
      loaded = null
    })
  }
  return loaded
}
