import { stoppedResult, timeoutResult, type CourseRequest, type RunRequest, type RunResult } from './core'

/** The part of the Worker API the runner uses; lets tests supply a fake. */
export interface WorkerLike {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((event: { data: any }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface RunnerOptions {
  createWorker: () => WorkerLike
  indexURL: string
  /** Time allowed for one program. */
  runTimeoutMs?: number
  /** Time allowed for Python itself to start. */
  loadTimeoutMs?: number
}

interface Live {
  worker: WorkerLike
  ready: Promise<void>
  /** The guided course's files have been sent to this worker. */
  course?: boolean
}

/**
 * Runs learner code in a worker. Python cannot be interrupted from outside, so
 * a program that overruns is stopped by terminating the worker; the next run
 * starts a fresh one.
 */
export class PythonRunner {
  private live: Live | null = null
  private nextId = 1
  private cancel: (() => void) | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: RunnerOptions) {}

  /** Starts Python in the background so the first Run is quick. */
  warm(): void {
    this.ensure().ready.catch(() => undefined)
  }

  /**
   * Runs a program. For an interactive request, `onOutput` is given what the program prints
   * as it prints it, and `input()` sends it a typed line.
   */
  run(request: RunRequest, onOutput?: (stream: 'out' | 'err', text: string) => void): Promise<RunResult> {
    const next = this.queue.then(() => this.runNow(request, onOutput))
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Gives the running interactive program one line, as if typed and followed by Enter. */
  input(text: string): void {
    this.live?.worker.postMessage({ type: 'stdin', text })
  }

  /**
   * Runs one guided-course command (check, run, solution, info). `curriculum` supplies the course
   * files, which are sent once to each new worker. A command that overruns ends the worker.
   */
  course(request: CourseRequest, curriculum: () => Promise<Record<string, string>>, timeoutMs = 90000): Promise<Record<string, unknown>> {
    const next = this.queue.then(() => this.courseNow(request, curriculum, timeoutMs))
    this.queue = next.catch(() => undefined)
    return next
  }

  private async courseNow(request: CourseRequest, curriculum: () => Promise<Record<string, string>>, timeoutMs: number): Promise<Record<string, unknown>> {
    const live = this.ensure()
    let files: Record<string, string> | undefined
    try {
      await live.ready
      if (!live.course) files = await curriculum()
    } catch (err) {
      this.dispose()
      return { problem: err instanceof Error ? err.message : String(err) }
    }
    const id = this.nextId++
    return new Promise<Record<string, unknown>>((done) => {
      const resolve = (result: Record<string, unknown>) => {
        this.cancel = null
        done(result)
      }
      const timer = setTimeout(() => {
        this.dispose()
        resolve({ problem: `Stopped after ${Math.round(timeoutMs / 1000)} seconds. Is there a loop that never ends?`, timedOut: true })
      }, timeoutMs)
      this.cancel = () => {
        clearTimeout(timer)
        this.dispose()
        resolve({ problem: 'Stopped.', stopped: true })
      }
      live.worker.onmessage = (event) => {
        const data = event.data
        if (data?.id !== id) return
        clearTimeout(timer)
        if (data.type === 'course-result') {
          live.course = true
          resolve(data.result as Record<string, unknown>)
        } else resolve({ problem: String(data.message ?? 'The course checker failed.') })
      }
      live.worker.onerror = () => {
        clearTimeout(timer)
        this.dispose()
        resolve({ problem: 'Python stopped unexpectedly.' })
      }
      live.worker.postMessage({ type: 'course', id, request, curriculum: files })
    })
  }

  dispose(): void {
    this.live?.worker.terminate()
    this.live = null
  }

  /** Stops the program that is running now, if any. Its run resolves with a "Stopped" result. */
  stop(): void {
    this.cancel?.()
  }

  private ensure(): Live {
    if (this.live) return this.live
    const worker = this.options.createWorker()
    const loadTimeoutMs = this.options.loadTimeoutMs ?? 60000
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Python took too long to start.')), loadTimeoutMs)
      worker.onmessage = (event) => {
        if (event.data?.type === 'ready') {
          clearTimeout(timer)
          resolve()
        } else if (event.data?.type === 'init-error') {
          clearTimeout(timer)
          reject(new Error(`Python failed to start: ${event.data.message}`))
        }
      }
      worker.onerror = () => {
        clearTimeout(timer)
        reject(new Error('Python failed to start.'))
      }
    })
    worker.postMessage({ type: 'init', indexURL: this.options.indexURL })
    this.live = { worker, ready }
    return this.live
  }

  private async runNow(request: RunRequest, onOutput?: (stream: 'out' | 'err', text: string) => void): Promise<RunResult> {
    const live = this.ensure()
    try {
      await live.ready
    } catch (err) {
      this.dispose()
      return internalError(err)
    }
    const timeoutMs = request.timeoutMs ?? this.options.runTimeoutMs ?? 5000
    const id = this.nextId++
    return new Promise<RunResult>((done) => {
      const resolve = (result: RunResult) => {
        this.cancel = null
        done(result)
      }
      const timer = setTimeout(() => {
        this.dispose()
        resolve(timeoutResult(timeoutMs))
      }, timeoutMs)
      this.cancel = () => {
        clearTimeout(timer)
        this.dispose()
        resolve(stoppedResult())
      }
      live.worker.onmessage = (event) => {
        const data = event.data
        if (data?.id !== id) return
        if (data.type === 'out') {
          onOutput?.(data.stream, String(data.text))
          return
        }
        clearTimeout(timer)
        if (data.type === 'result') resolve(data.result as RunResult)
        else resolve(internalError(data.message))
      }
      live.worker.onerror = (event) => {
        clearTimeout(timer)
        this.dispose()
        resolve(internalError(event))
      }
      live.worker.postMessage({ type: 'run', id, request })
    })
  }
}

function internalError(err: unknown): RunResult {
  const message = err instanceof Error ? err.message : String(err)
  return {
    stdout: '',
    error: { kind: 'internal', type: 'RunnerError', message, line: null, traceback: '' },
    tests: [],
    durationMs: 0,
  }
}

let shared: PythonRunner | null = null

/** The app-wide runner, backed by the real Pyodide worker. */
export function getRunner(): PythonRunner {
  if (!shared) {
    shared = new PythonRunner({
      createWorker: () =>
        new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
      indexURL: new URL('pyodide/', document.baseURI).href,
    })
  }
  return shared
}
