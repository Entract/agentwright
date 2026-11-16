// Revision sets that ship inside the app, so they can be added without importing a file.
// They are read at build time from plan/mocks/out, where plan/mocks/build.py writes them,
// so the next app build picks up any change to the sets. The timed mocks stay out: they
// call Claude for real and are done at the PC.
const files = import.meta.glob(['../../../plan/mocks/out/Lesson_*.json', '../../../plan/mocks/out/Sight_Reading_Python.json'], {
  eager: true,
  import: 'default',
}) as Record<string, { title: string; questions: unknown[] }>

export interface ReadyMadeSet {
  file: string
  title: string
  count: number
  /** The set as JSON text, read by the same importer as a pasted set. */
  text: string
}

export const READY_MADE: ReadyMadeSet[] = Object.entries(files)
  .map(([path, set]) => ({
    file: path.slice(path.lastIndexOf('/') + 1),
    title: set.title,
    count: set.questions.length,
    text: JSON.stringify(set),
  }))
  // The five lessons in order, then the drill.
  .sort((a, b) => (a.file.startsWith('Lesson_') === b.file.startsWith('Lesson_') ? a.file.localeCompare(b.file) : a.file.startsWith('Lesson_') ? -1 : 1))
