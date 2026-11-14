import { loadPyodide } from 'pyodide'
import type { PyodideLike } from './core'

let instance: Promise<PyodideLike> | null = null

/** One Pyodide instance shared by the Node test suites (loading it takes a few seconds). */
export function testPyodide(): Promise<PyodideLike> {
  if (!instance) instance = loadPyodide() as unknown as Promise<PyodideLike>
  return instance
}
