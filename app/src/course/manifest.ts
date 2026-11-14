// The guided curriculum. The JSON manifest is the canonical content. The pack's 58 exercise
// IDs are never renumbered; exercises added later get new IDs (3P-A..3P-F sit before 3A, 7R-A..7R-F before 7A); the same file is read by the Python checker (labcheck.py).
import raw from '../../../desktop/curriculum/manifest.json'

export interface CourseExercise {
  id: string
  title: string
  module: string
  priority: 'P0' | 'P1'
  mode: 'write' | 'debug' | 'refactor' | 'trace' | 'explain' | 'mock' | 'integration' | 'build'
  fixtures: string[]
  task: string
  starter: string
  /** Acceptance criteria in English. The executable tests are separate and are not shown. */
  tests: string[]
  hints: string[]
  concepts: string[]
  author_notes: string
  /** A short explanation of the idea, shown above the task. Only some exercises have one. */
  lesson?: string[]
  /** A plain-language briefing around the task: what is going on, what exists, what to produce, what Check tries, the Python needed. */
  brief?: Brief
  /** Project milestones only: the numbered exercise after which this milestone is suggested. */
  after?: string
  /** Project milestones only: one line saying what this milestone adds, put at the top of the carried-forward code. */
  todo?: string
}

export interface Brief {
  story: string[]
  given: { name: string; what: string }[]
  make: string
  examples: { when: string; then: string }[]
  examples_note?: string
  python: { point: string; code: string }[]
  /** Lines the learner can add under their code so that Run shows something. */
  tryit?: string
}

export interface CourseModule {
  id: string
  name: string
  weight: string
  goal: string
}

interface Manifest {
  schema_version: string
  title: string
  modules: CourseModule[]
  fixtures: Record<string, string>
  exercises: CourseExercise[]
}

const manifest = raw as unknown as Manifest

export const SCHEMA_VERSION = manifest.schema_version
export const MODULES: CourseModule[] = manifest.modules
export const EXERCISES: CourseExercise[] = manifest.exercises
export const FIXTURES: Record<string, string> = manifest.fixtures
export const EXERCISE_IDS: string[] = EXERCISES.map((e) => e.id)

const byId = new Map(EXERCISES.map((e) => [e.id, e]))

export function exercise(id: string): CourseExercise | undefined {
  return byId.get(id)
}

/** The curriculum's recommended return point for this learner. */
export const START_ID = '3C'

/** The priority route from the curriculum (section 4). Other exercises deepen it. */
export const PRIORITY_ROUTE: string[] = [
  '1A', '1B', '1C', '1D', '1E', '1F', '2A', '2B', '2C', '2D', '2E', '2F', '2G', '3P-A', '3P-B', '3P-C', '3P-D', '3P-E', '3P-F', '3A', '3B', '3C',
  '4A', '4B', '4C', '4D', '4E', '5A', '5B', '5C', '5D', '6A', '6B', '6C', '6D', '7R-A', '7R-B', '7R-C', '7R-D', '7R-E', '7R-F', '7A', '7B', '7C', '7D', '8A', '8B', '8C', '9A',
  'LAB-01', 'LAB-02', 'LAB-03', 'LAB-04', 'LAB-05', 'LAB-06', 'LAB-07', 'LAB-08', 'LAB-09', 'LAB-10', 'LAB-11', 'LAB-12',
]

export function onPriorityRoute(id: string): boolean {
  return PRIORITY_ROUTE.includes(id)
}

/** Accepts what a mentor might say or type: "3c", "open 3C", "exercise 4a", "3p-b", "3P D". */
export function parseExerciseId(text: string): string | null {
  const lab = /\blab\s*-?\s*0?([1-9][0-9]?)\b/i.exec(text)
  if (lab) {
    const id = `LAB-${lab[1].padStart(2, '0')}`
    return byId.has(id) ? id : null
  }
  const prep = /\b([1-9])\s*([pr])\s*-?\s*([a-zA-Z])\b/i.exec(text)
  if (prep) {
    const id = `${prep[1]}${prep[2].toUpperCase()}-${prep[3].toUpperCase()}`
    if (byId.has(id)) return id
  }
  const match = /\b([1-9])\s*([a-zA-Z])\b/.exec(text)
  if (!match) return null
  const id = match[1] + match[2].toUpperCase()
  return byId.has(id) ? id : null
}

/** The exercise before this one in the same module, shown as its prerequisite. */
export function prerequisite(id: string): string | null {
  const index = EXERCISE_IDS.indexOf(id)
  if (index <= 0) return null
  const previous = EXERCISES[index - 1]
  return previous.module === byId.get(id)?.module ? previous.id : null
}

export function neighbour(id: string, step: 1 | -1, available?: (id: string) => boolean): string | null {
  let index = EXERCISE_IDS.indexOf(id) + step
  while (index >= 0 && index < EXERCISE_IDS.length) {
    if (!available || available(EXERCISE_IDS[index])) return EXERCISE_IDS[index]
    index += step
  }
  return null
}

export type Dimension = 'reading' | 'writing' | 'debugging' | 'design' | 'protocol'

export const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'reading', label: 'Reading and tracing code' },
  { id: 'writing', label: 'Writing code' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'design', label: 'Design judgement' },
  { id: 'protocol', label: 'Tool-use protocol' },
]

const READING = ['2A', '2B', '2C', '2G', '3P-A', '3F', '7R-A', '7R-B', '7R-C', '7R-D', '7R-E', '7R-F', '7F']
const PROTOCOL = ['4A', '4B', '4C', '4D', '4E', '4F', '4H', '5A', '5B', '5C', '5D', '5G']
const DESIGN = ['3P-B', '3P-C', '3P-D', '5F', '6A', '6C', '6E', '6F', '6G', '6H', '7E', '8A', '8B', '8C', '8D', '9B', '9C']

/** Which of the five tracked skills an exercise mainly practises. */
export function dimensionOf(e: CourseExercise): Dimension {
  if (READING.includes(e.id)) return 'reading'
  if (e.mode === 'debug' || ['8E', '8F', '9A'].includes(e.id)) return 'debugging'
  if (PROTOCOL.includes(e.id)) return 'protocol'
  if (DESIGN.includes(e.id)) return 'design'
  return 'writing'
}

/** The growing-agent project: its milestones, in order. */
export const PROJECT_MODULE = 'LAB'
export const MILESTONES: string[] = EXERCISES.filter((e) => e.module === PROJECT_MODULE).map((e) => e.id)

export function isMilestone(id: string): boolean {
  return byId.get(id)?.module === PROJECT_MODULE
}

/** The project milestone suggested once this numbered exercise is done, if there is one. */
export function milestonesAfter(id: string): string[] {
  return EXERCISES.filter((e) => e.module === PROJECT_MODULE && e.after === id).map((e) => e.id)
}
