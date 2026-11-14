/// <reference lib="webworker" />
import { canWaitForNetwork, courseWithPyodide, hasCourse, installCourse, runWithPyodide, runWithPyodideAsync, type CourseRequest, type PyodideLike, type RunRequest } from './core'

type Incoming =
  | { type: 'init'; indexURL: string }
  | { type: 'run'; id: number; request: RunRequest }
  | { type: 'stdin'; text: string }
  | { type: 'course'; id: number; request: CourseRequest; curriculum?: Record<string, string> }

let pyodide: PyodideLike | null = null
let indexURL = ''
let packages: Promise<void> | null = null

// The interactive run in progress: where its output goes, and the lines typed for it.
let liveId = 0
let typedLines: string[] = []
let waiting: ((line: string) => void) | null = null
let hostRegistered = false

/** What Python sees as the module "lab_host_js" during an interactive run. */
const labHost = {
  write(stream: string, text: string): void {
    if (liveId) self.postMessage({ type: 'out', id: liveId, stream: stream === 'err' ? 'err' : 'out', text })
  },
  read_line(): Promise<string> {
    const ready = typedLines.shift()
    if (ready !== undefined) return Promise.resolve(ready)
    return new Promise<string>((resolve) => {
      waiting = resolve
    })
  },
}

/** Loads the bundled anthropic library and what it needs, from the app's own files. Done once, on first use. */
function loadNetworkPackages(py: PyodideLike): Promise<void> {
  if (!packages) {
    packages = (async () => {
      const base = `${indexURL}packages/`
      const files = (await (await fetch(`${base}index.json`)).json()) as string[]
      await py.loadPackage(files.map((f) => base + f), { messageCallback: () => undefined })
    })()
    packages.catch(() => {
      packages = null
    })
  }
  return packages
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data
  if (msg.type === 'stdin') {
    if (waiting) {
      const give = waiting
      waiting = null
      give(msg.text)
    } else if (liveId) typedLines.push(msg.text)
    return
  }
  if (msg.type === 'init') {
    try {
      // Loaded from the app's own files (public/pyodide), never from the network.
      const mod = await import(/* @vite-ignore */ `${msg.indexURL}pyodide.mjs`)
      indexURL = msg.indexURL
      pyodide = (await mod.loadPyodide({ indexURL: msg.indexURL })) as PyodideLike
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'init-error', message: String(err) })
    }
    return
  }
  if (msg.type === 'course') {
    if (!pyodide) {
      self.postMessage({ type: 'run-error', id: msg.id, message: 'Python is not loaded.' })
      return
    }
    try {
      if (!hasCourse(pyodide)) {
        if (!msg.curriculum) throw new Error('The course files were not sent.')
        // The course's simulated responses are real SDK objects, so the bundled library is needed.
        await loadNetworkPackages(pyodide)
        installCourse(pyodide, msg.curriculum)
      }
      self.postMessage({ type: 'course-result', id: msg.id, result: courseWithPyodide(pyodide, msg.request) })
    } catch (err) {
      self.postMessage({ type: 'run-error', id: msg.id, message: String(err) })
    }
    return
  }
  if (msg.type === 'run') {
    if (!pyodide) {
      self.postMessage({ type: 'run-error', id: msg.id, message: 'Python is not loaded.' })
      return
    }
    try {
      if (msg.request.interactive) {
        if (!hostRegistered) {
          pyodide.registerJsModule?.('lab_host_js', labHost)
          hostRegistered = true
        }
        liveId = msg.id
        typedLines = []
        waiting = null
      }
      if (msg.request.network || msg.request.interactive) {
        if (msg.request.network) await loadNetworkPackages(pyodide)
        // An older browser cannot pause Python for a reply: the library still imports and
        // its types can be used, but a call to the API fails with a connection error.
        const result = canWaitForNetwork() ? await runWithPyodideAsync(pyodide, msg.request, !!msg.request.network) : runWithPyodide(pyodide, msg.request, !!msg.request.network)
        liveId = 0
        self.postMessage({ type: 'result', id: msg.id, result })
        return
      }
      self.postMessage({ type: 'result', id: msg.id, result: runWithPyodide(pyodide, msg.request) })
    } catch (err) {
      liveId = 0
      self.postMessage({ type: 'run-error', id: msg.id, message: String(err) })
    }
  }
}
