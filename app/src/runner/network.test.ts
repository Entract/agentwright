import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { needsNetwork, runWithPyodide, type PyodideLike } from './core'
import { PythonRunner, type WorkerLike } from './client'
import { testPyodide } from './testPyodide'

let py: PyodideLike

beforeAll(async () => {
  py = await testPyodide()
})

describe('programs that use the anthropic library', () => {
  it('recognises an anthropic import, and nothing else, as needing the network', () => {
    expect(needsNetwork('import anthropic\nclient = anthropic.Anthropic()')).toBe(true)
    expect(needsNetwork('x = 1\n    from anthropic import Anthropic')).toBe(true)
    expect(needsNetwork('import anthropic.types as t')).toBe(true)
    expect(needsNetwork('print("import anthropic")')).toBe(false)
    expect(needsNetwork('# import anthropic\nimport json')).toBe(false)
    expect(needsNetwork('import anthropic_helpers')).toBe(false)
  })

  it('gives a run its environment variables and takes them away afterwards', () => {
    const code = 'import os\nprint(os.environ.get("ANTHROPIC_API_KEY"))'
    expect(runWithPyodide(py, { code, env: { ANTHROPIC_API_KEY: 'test-value' } }).stdout).toBe('test-value\n')
    expect(runWithPyodide(py, { code }).stdout).toBe('None\n')
  })

  it('bundles every package in the manifest, and they are enough to import anthropic and build a client', async () => {
    const dir = resolve('public/pyodide/packages')
    const listed = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as string[]
    expect(readdirSync(dir).filter((f) => f.endsWith('.whl')).sort()).toEqual([...listed].sort())

    await py.loadPackage(listed.map((f) => join(dir, f)), { messageCallback: () => undefined })
    // Node has no promise integration without a flag, so the test runs the program the plain way;
    // the waiting-on-the-network path is exercised in a real browser.
    const result = runWithPyodide(
      py,
      {
      code: [
        'import anthropic, httpx2_jsfetch',
        'client = anthropic.Anthropic(api_key="not-a-real-key")',
        'print(anthropic.__version__, type(client).__name__, httpx2_jsfetch._lab_patched)',
      ].join('\n'),
        network: true,
      },
      true,
    )
    expect(result.error).toBeNull()
    expect(result.stdout).toBe('2.6.0 Anthropic True\n')
  })
})

class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: any }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  terminated = false
  constructor(private readonly hang: boolean) {}
  postMessage(message: any): void {
    if (message.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }))
    if (message.type === 'run' && !this.hang) {
      const result = { stdout: 'ok\n', error: null, tests: [], durationMs: 1 }
      queueMicrotask(() => this.onmessage?.({ data: { type: 'result', id: message.id, result } }))
    }
  }
  terminate(): void {
    this.terminated = true
  }
}

function runnerWith(workers: FakeWorker[]) {
  return new PythonRunner({
    indexURL: 'x/',
    runTimeoutMs: 5000,
    createWorker: () => {
      const w = new FakeWorker(workers.length === 0)
      workers.push(w)
      return w
    },
  })
}

describe('long-running programs', () => {
  it('lets one run have a longer time limit than the default', async () => {
    vi.useFakeTimers()
    const workers: FakeWorker[] = []
    const runner = runnerWith(workers)
    let settled = false
    const waiting = runner.run({ code: 'import anthropic', network: true, timeoutMs: 60000 }).then((r) => {
      settled = true
      return r
    })
    await vi.advanceTimersByTimeAsync(30000)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(30001)
    expect((await waiting).error?.message).toContain('60 seconds')
    vi.useRealTimers()
  })

  it('stops a running program on request and recovers on the next run', async () => {
    const workers: FakeWorker[] = []
    const runner = runnerWith(workers)
    const waiting = runner.run({ code: 'import anthropic', network: true, timeoutMs: 60000 })
    await new Promise((r) => setTimeout(r, 10))
    runner.stop()
    const stopped = await waiting
    expect(stopped.error).toMatchObject({ kind: 'timeout', type: 'Stopped' })
    expect(workers[0].terminated).toBe(true)
    expect((await runner.run({ code: 'print("ok")' })).stdout).toBe('ok\n')
    runner.stop() // nothing running: no effect
    expect(workers).toHaveLength(2)
  })
})
