/**
 * The link to the desktop window that hosts this page. Through it the page can
 * run code with the Python installed on the PC. In a plain browser there is no
 * host, and only the built-in Python is offered.
 */

export interface HostInfo {
  python: { path: string; version: string } | null
  hasKey: boolean
  workDir: string
}

export type HostMessage =
  | ({ type: 'host' } & HostInfo)
  | { type: 'out'; id: number; stream: 'out' | 'err'; text: string }
  | { type: 'exit'; id: number; code?: number; stopped?: boolean; ms?: number; problem?: string }
  | { type: 'problem'; message: string }
  | { type: 'course'; info?: CourseInfo; problem?: string; progress?: string | null }
  | { type: 'checked'; id: number; exerciseId: string; report?: unknown; problem?: string }
  | { type: 'solution'; exerciseId: string; text?: string | null; problem?: string | null }
  | { type: 'progress'; json: string }
  | { type: 'mentorText'; id: number; text: string }
  | { type: 'mentorDone'; id: number; problem?: string | null; stopped?: boolean }
  | { type: 'files'; files: { name: string; text: string }[]; skipped: number; problem?: string }
  | { type: 'fileProblem'; name: string; problem: string }

/** What labcheck.py reports about itself: which exercises have tests, and any multi-file workspaces. */
export interface CourseInfo {
  implemented: string[]
  python: string
  anthropic: string | null
  anthropicError?: string
  workspaces: Record<string, { files?: Record<string, string>; entry?: string; readonly?: string[]; explanation?: boolean; note?: string; extra_fixtures?: Record<string, string>; interactive?: boolean; previous?: string; live?: boolean }>
}

export type Outgoing =
  | { type: 'course' }
  | { type: 'courseRun'; id: number; exerciseId: string; files: Record<string, string>; explanation: string; live?: boolean }
  | { type: 'courseCheck'; id: number; exerciseId: string; files: Record<string, string>; explanation: string }
  | { type: 'courseSolution'; exerciseId: string }
  | { type: 'courseSave'; json: string }
  | { type: 'courseExport' }
  | { type: 'courseImport' }
  | { type: 'size'; width: number; height: number }
  | { type: 'hello' }
  | { type: 'run'; id: number; code: string; trace?: boolean; file?: string }
  | { type: 'files' }
  | { type: 'fileWrite'; name: string; text: string }
  | { type: 'fileDelete'; name: string }
  | { type: 'stdin'; text: string }
  | { type: 'stop' }
  | { type: 'key' }
  | { type: 'mentor'; id: number; system: string; messages: { role: 'user' | 'assistant'; content: string }[] }
  | { type: 'mentorStop' }
  | { type: 'folder' }

interface WebViewBridge {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

function bridge(): WebViewBridge | null {
  return (window as unknown as { chrome?: { webview?: WebViewBridge } }).chrome?.webview ?? null
}

/** A stand-in for the PC window's host program, living in the page itself. The phone app installs one. */
export interface LocalHost {
  kind: 'phone'
  send(message: Outgoing): void
  subscribe(listener: (message: HostMessage) => void): () => void
}

let local: LocalHost | null = null

export function installLocalHost(host: LocalHost): void {
  local = host
}

export const hasHost = (): boolean => bridge() !== null || local !== null

/** Which host answers: the PC window's program, the phone's stand-in, or none (a plain browser). */
export const hostKind = (): 'pc' | 'phone' | null => (bridge() ? 'pc' : local ? local.kind : null)

export function sendToHost(message: Outgoing): void {
  const b = bridge()
  if (b) b.postMessage(message)
  else local?.send(message)
}

export function onHostMessage(listener: (message: HostMessage) => void): () => void {
  const b = bridge()
  if (!b) return local ? local.subscribe(listener) : () => undefined
  const handler = (event: { data: unknown }) => {
    const data = event.data as HostMessage | null
    if (data && typeof data === 'object' && 'type' in data) listener(data)
  }
  b.addEventListener('message', handler)
  return () => b.removeEventListener('message', handler)
}
