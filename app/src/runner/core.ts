import type { ErrorClass, TestSpec, Verdict } from '../types'
import { COURSE_SHIM } from './courseShim'
import { HARNESS } from './harness'

export interface RunRequest {
  code: string
  /** Extra files written next to the program before it runs. */
  files?: Record<string, string>
  tests?: TestSpec[]
  /** Variables defined before the program runs. */
  given?: Record<string, unknown>
  maxOutput?: number
  /**
   * An interactive run: output is handed over as it is printed instead of being collected,
   * and input() waits for a line typed by the learner. Needs the worker's "lab_host_js" module.
   */
  interactive?: boolean
  /**
   * The program talks to the network (it imports the anthropic library). The
   * bundled packages are loaded first and the run is allowed to wait for replies.
   */
  network?: boolean
  /** Environment variables for this run only, such as ANTHROPIC_API_KEY. */
  env?: Record<string, string>
  /** Overrides the runner's time limit for this run. */
  timeoutMs?: number
}

/** True when a program imports the anthropic library, so it needs the bundled packages and the network. */
export function needsNetwork(code: string): boolean {
  return /^[ \t]*(import|from)[ \t]+anthropic\b/m.test(code)
}

export interface RunError {
  kind: 'syntax' | 'runtime' | 'timeout' | 'internal'
  type: string
  message: string
  line: number | null
  traceback: string
}

export interface TestResult {
  name: string
  passed: boolean
  kind: 'pass' | 'logic' | 'runtime' | 'misread'
  message: string
  call?: string
  expected?: string
  actual?: string
}

export interface RunResult {
  stdout: string
  error: RunError | null
  tests: TestResult[]
  durationMs: number
}

/** The small part of the Pyodide API the runner depends on. */
export interface PyodideLike {
  runPython(code: string): unknown
  loadPackage(names: string[], options?: { messageCallback?: (message: string) => void }): Promise<unknown>
  globals: { get(name: string): unknown }
  registerJsModule?(name: string, module: object): void
}

const installed = new WeakSet<object>()

type LabRun = ((payload: string) => string) & { callPromising(payload: string): Promise<string> }

function labRun(py: PyodideLike): LabRun {
  if (!installed.has(py)) {
    py.runPython(HARNESS)
    installed.add(py)
  }
  return py.globals.get('__lab_run') as LabRun
}

/** Runs one request on an already-loaded Pyodide instance. Shared by the worker and the tests. */
export function runWithPyodide(py: PyodideLike, request: RunRequest, withPackages = false): RunResult {
  const started = Date.now()
  const run = labRun(py)
  if (withPackages) py.runPython('__lab_net_setup()')
  const parsed = JSON.parse(run(JSON.stringify(request))) as Omit<RunResult, 'durationMs'>
  return { ...parsed, durationMs: Date.now() - started }
}

/**
 * Runs a request that may wait on the network. Python is entered through a
 * "promising" call, which lets a synchronous Python call such as
 * client.messages.create() pause while the browser's fetch completes.
 * The bundled packages must already be loaded.
 */
export async function runWithPyodideAsync(py: PyodideLike, request: RunRequest, withPackages = true): Promise<RunResult> {
  const started = Date.now()
  const run = labRun(py)
  if (withPackages) py.runPython('__lab_net_setup()')
  const parsed = JSON.parse(await run.callPromising(JSON.stringify(request))) as Omit<RunResult, 'durationMs'>
  return { ...parsed, durationMs: Date.now() - started }
}

/** Whether this browser can pause Python for a network reply (WebAssembly JS Promise Integration). */
export function canWaitForNetwork(): boolean {
  return typeof (WebAssembly as unknown as { Suspending?: unknown }).Suspending === 'function'
}

export function stoppedResult(): RunResult {
  return {
    stdout: '',
    error: { kind: 'timeout', type: 'Stopped', message: 'Stopped before the program finished.', line: null, traceback: '' },
    tests: [],
    durationMs: 0,
  }
}

export interface RunGrade {
  verdict: Verdict
  errorClass: ErrorClass
}

/**
 * Turns a run into an outcome. A syntax error is reported as its own class so
 * that a missing quote or colon is never counted against the concept.
 */
export function gradeRun(result: RunResult): RunGrade {
  if (result.error) {
    return { verdict: 'incorrect', errorClass: result.error.kind === 'syntax' ? 'syntax' : 'runtime' }
  }
  const failed = result.tests.filter((t) => !t.passed)
  if (failed.length === 0) return { verdict: 'correct', errorClass: 'none' }
  let errorClass: ErrorClass = 'logic'
  if (failed.some((t) => t.kind === 'misread')) errorClass = 'misread'
  else if (failed.every((t) => t.kind === 'runtime')) errorClass = 'runtime'
  const verdict: Verdict = failed.length < result.tests.length ? 'partial' : 'incorrect'
  return { verdict, errorClass }
}

export function timeoutResult(timeoutMs: number): RunResult {
  return {
    stdout: '',
    error: {
      kind: 'timeout',
      type: 'Timeout',
      message: `Stopped after ${timeoutMs / 1000} seconds. The program did not finish. Is there a loop that never ends?`,
      line: null,
      traceback: '',
    },
    tests: [],
    durationMs: timeoutMs,
  }
}

/** One request to the guided course's checker. */
export interface CourseRequest {
  command: 'info' | 'check' | 'run' | 'solution'
  exerciseId?: string
  files?: Record<string, string>
  explanation?: string
  /** Lines the program will be given, one per call to input(). */
  input?: string[]
}

const courseInstalled = new WeakSet<object>()

/**
 * Puts the curriculum files into this Python instance (once) and loads the checks.
 * The bundled anthropic packages must already be loaded.
 */
export function installCourse(py: PyodideLike, curriculum: Record<string, string>): void {
  if (courseInstalled.has(py)) return
  py.runPython(COURSE_SHIM)
  const install = py.globals.get('__course_install') as (files: string) => string
  install(JSON.stringify(curriculum))
  courseInstalled.add(py)
}

export function hasCourse(py: PyodideLike): boolean {
  return courseInstalled.has(py)
}

/** Runs one course command; the answer is the JSON object described in courseShim.ts. */
export function courseWithPyodide(py: PyodideLike, request: CourseRequest): Record<string, unknown> {
  const call = py.globals.get('__course') as (payload: string) => string
  return JSON.parse(call(JSON.stringify(request))) as Record<string, unknown>
}
