import { beforeAll, describe, expect, it, vi } from 'vitest'
import { gradeRun, runWithPyodide, type PyodideLike, type RunRequest } from './core'
import { PythonRunner, type WorkerLike } from './client'
import { testPyodide } from './testPyodide'
import type { TestSpec } from '../types'

let py: PyodideLike
const run = (request: RunRequest) => runWithPyodide(py, request)

beforeAll(async () => {
  py = await testPyodide()
})

const countHighTests: TestSpec[] = [
  { kind: 'call', name: 'empty list', fn: 'count_high', args: [[]], expect: 0 },
  { kind: 'call', name: 'boundary values', fn: 'count_high', args: [[11, 11.0, 11.01]], expect: 1 },
  { kind: 'call', name: 'all high', fn: 'count_high', args: [[12, 13]], expect: 2 },
]

describe('running code', () => {
  it('captures printed output', () => {
    const r = run({ code: 'for n in [1, 2]:\n    print(n)\n' })
    expect(r.error).toBeNull()
    expect(r.stdout).toBe('1\n2\n')
  })

  it('passes a correct function, whatever the implementation', () => {
    const loop = 'def count_high(ms):\n    c = 0\n    for m in ms:\n        if m > 11:\n            c += 1\n    return c\n'
    const comprehension = 'def count_high(ms):\n    return len([m for m in ms if m > 11])\n'
    for (const code of [loop, comprehension]) {
      const r = run({ code, tests: countHighTests })
      expect(r.tests.map((t) => t.passed)).toEqual([true, true, true])
      expect(gradeRun(r)).toEqual({ verdict: 'correct', errorClass: 'none' })
    }
  })

  it('reports a missing quote as a syntax error, not a logic error', () => {
    const r = run({ code: 'status = "ok\nprint(status)\n', tests: countHighTests })
    expect(r.error?.kind).toBe('syntax')
    expect(r.error?.line).toBe(1)
    expect(r.tests).toEqual([])
    expect(gradeRun(r).errorClass).toBe('syntax')
  })

  it('reports a runtime error with the line and a traceback of the learner code only', () => {
    const r = run({ code: 'reading = {"mass": 10}\nprint(reading["unit"])\n' })
    expect(r.error?.kind).toBe('runtime')
    expect(r.error?.type).toBe('KeyError')
    expect(r.error?.line).toBe(2)
    expect(r.error?.traceback).toContain('File "main.py", line 2')
    expect(r.error?.traceback).not.toContain('__lab')
    expect(gradeRun(r).errorClass).toBe('runtime')
  })

  it('reports a wrong result as a logic error with actual and expected', () => {
    const code = 'def count_high(ms):\n    c = 0\n    for m in ms:\n        if m >= 11:\n            c += 1\n    return c\n'
    const r = run({ code, tests: countHighTests })
    const failed = r.tests.find((t) => !t.passed)!
    expect(failed.name).toBe('boundary values')
    expect(failed.expected).toBe('1')
    expect(failed.actual).toBe('3')
    expect(gradeRun(r)).toEqual({ verdict: 'partial', errorClass: 'logic' })
  })

  it('explains print-instead-of-return', () => {
    const code = 'def count_high(ms):\n    print(len(ms))\n'
    const r = run({ code, tests: countHighTests })
    expect(r.tests[0].passed).toBe(false)
    expect(r.tests[0].message).toContain('returned None')
  })

  it('flags a missing function as a misread requirement', () => {
    const r = run({ code: 'def count(ms):\n    return 0\n', tests: countHighTests })
    expect(gradeRun(r).errorClass).toBe('misread')
  })

  it('checks printed output and assertion snippets', () => {
    const r = run({
      code: 'total = 3\nprint(total)\n',
      tests: [
        { kind: 'stdout', name: 'prints the total', expect: '3' },
        { kind: 'python', name: 'total is a number', code: 'assert isinstance(total, int), "total should be an int"' },
        { kind: 'python', name: 'total is 4', code: 'assert total == 4, "total should be 4"' },
      ],
    })
    expect(r.tests.map((t) => t.passed)).toEqual([true, true, false])
    expect(r.tests[2].message).toBe('total should be 4')
  })

  it('starts each run with a clean namespace and working directory', () => {
    run({ code: 'leftover = 1\nwith open("notes.txt", "w") as f:\n    f.write("x")\n' })
    const r = run({ code: 'import os\nprint("leftover" in dir(), os.listdir("."))\n' })
    expect(r.stdout).toBe("False ['main.py']\n")
  })

  it('supports extra files and importing them', () => {
    const r = run({
      code: 'import helpers\nprint(helpers.double(4))\n',
      files: { 'helpers.py': 'def double(x):\n    return x * 2\n' },
    })
    expect(r.stdout).toBe('8\n')
  })

  it('stops runaway output', () => {
    const r = run({ code: 'while True:\n    print("x" * 100)\n', maxOutput: 2000 })
    expect(r.error?.message).toContain('Output limit exceeded')
  })

  it('refuses input() with a clear message', () => {
    const r = run({ code: 'name = input("Name? ")\n' })
    expect(r.error?.message).toContain('input() is not available')
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

describe('worker client', () => {
  it('terminates a program that never finishes and recovers on the next run', async () => {
    vi.useFakeTimers()
    const workers: FakeWorker[] = []
    const runner = new PythonRunner({
      indexURL: 'x/',
      runTimeoutMs: 5000,
      createWorker: () => {
        const w = new FakeWorker(workers.length === 0)
        workers.push(w)
        return w
      },
    })
    const first = runner.run({ code: 'while True:\n    pass\n' })
    await vi.advanceTimersByTimeAsync(5001)
    const hung = await first
    expect(hung.error?.kind).toBe('timeout')
    expect(workers[0].terminated).toBe(true)

    const second = await runner.run({ code: 'print("ok")' })
    expect(second.stdout).toBe('ok\n')
    expect(workers).toHaveLength(2)
    vi.useRealTimers()
  })
})
