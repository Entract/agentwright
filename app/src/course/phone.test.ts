// The guided course as the phone runs it: the PC's checker inside the app's own Python (Pyodide).
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { courseWithPyodide, installCourse, runWithPyodide, type PyodideLike } from '../runner/core'
import { testPyodide } from '../runner/testPyodide'
import { curriculumFiles } from './curriculumFiles'
import generated from './info.generated.json'
import { EXERCISE_IDS, exercise } from './manifest'
import type { CheckReport } from './progress'

interface Workspace {
  files?: Record<string, string>
  entry?: string
  previous?: string
}

const WORKSPACES = generated.workspaces as Record<string, Workspace>
const LONG_ENOUGH = 'A reasonably long written explanation of the idea goes here for testing.'

let py: PyodideLike
let solutions: Record<string, string | Record<string, string>>

function solutionFiles(id: string, program: string | Record<string, string>): Record<string, string> {
  if (typeof program !== 'string') return { ...program }
  const ws = WORKSPACES[id] ?? {}
  const files = { ...(ws.files ?? {}) }
  files['main.py' in files || !ws.entry ? 'main.py' : ws.entry] = program
  return files
}

function starterFiles(id: string): Record<string, string> {
  const ws = WORKSPACES[id] ?? {}
  const files = { ...(ws.files ?? {}) }
  const entry = ws.entry ?? 'main.py'
  if (!(entry in files)) files[entry] = ws.previous ? (solutions[ws.previous] as string) : (exercise(id)?.starter ?? '')
  return files
}

function check(id: string, files: Record<string, string>, explanation = LONG_ENOUGH): CheckReport {
  const answer = courseWithPyodide(py, { command: 'check', exerciseId: id, files, explanation })
  expect(answer.problem).toBeUndefined()
  return answer.report as CheckReport
}

function run(id: string, files: Record<string, string>, input?: string[]): { output: string; stopped: boolean } {
  const answer = courseWithPyodide(py, { command: 'run', exerciseId: id, files, input })
  expect(answer.problem).toBeUndefined()
  return answer as { output: string; stopped: boolean }
}

beforeAll(async () => {
  py = await testPyodide()
  const dir = resolve('public/pyodide/packages')
  const listed = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as string[]
  await py.loadPackage(listed.map((f) => join(dir, f)), { messageCallback: () => undefined })
  installCourse(py, await curriculumFiles())
  solutions = JSON.parse(py.runPython('import json, labcheck\njson.dumps(labcheck.answer_key()[0])') as string)
}, 240000)

describe('the guided course in the phone app', () => {
  it('ships the checker, every checks file and the answer key, but not the self-test', async () => {
    const names = Object.keys(await curriculumFiles())
    expect(names).toContain('labcheck.py')
    expect(names).toContain('manifest.json')
    expect(names).toContain('checks_lab_later.py')
    expect(names).toContain('answer_key_7r.py')
    expect(names.some((n) => n.startsWith('test_'))).toBe(false)
  })

  it('has an up-to-date copy of the course description (npm run course-info rebuilds it)', () => {
    const live = courseWithPyodide(py, { command: 'info' }).info as { implemented: string[]; workspaces: unknown }
    expect(live.implemented).toEqual(generated.implemented)
    expect(live.workspaces).toEqual(generated.workspaces)
    expect([...live.implemented].sort()).toEqual([...EXERCISE_IDS].sort())
  })

  it('passes every reference solution with the same tests as the PC', () => {
    const failed: string[] = []
    for (const id of EXERCISE_IDS) {
      const report = check(id, solutionFiles(id, solutions[id]))
      if (!report.ok) failed.push(`${id}: ${report.cases.filter((c) => !c.passed).map((c) => `${c.name} - ${c.message}`).join(' | ') || JSON.stringify(report.syntaxError)}`)
    }
    expect(failed).toEqual([])
  }, 600000)

  it('does not pass any untouched starter, and never blames the checker', () => {
    const wrong: string[] = []
    for (const id of EXERCISE_IDS) {
      if (id === '3F') continue // its starter is complete; the exercise is the written explanation
      const report = check(id, starterFiles(id))
      if (report.ok) wrong.push(`${id} passed`)
      if (report.cases.some((c) => (c as { checkerError?: boolean }).checkerError)) wrong.push(`${id} checker error`)
    }
    expect(wrong).toEqual([])
  }, 600000)

  it('gives back a reference solution only when asked for one', () => {
    const answer = courseWithPyodide(py, { command: 'solution', exerciseId: '3C' })
    expect(String(answer.text)).toContain('results.append')
    expect(courseWithPyodide(py, { command: 'solution', exerciseId: 'nope' }).problem).toBeTruthy()
  })

  it('runs a program with its fixtures and reports an error against the learner’s own lines', () => {
    const program = "print(response.content[1].name)\nprint(read_balance('XPR205'))\nprint(undefined_name)\n"
    const { output } = run('3C', { 'main.py': program })
    expect(output).toContain("read_balance\n{'balance_id': 'XPR205', 'mass': 10.52, 'unit': 'g'}\n")
    expect(output).toContain('File "main.py", line 3')
    expect(output).toContain('NameError')
    expect(output).not.toContain('labcheck')
  })

  it('stops a loop that never ends without losing Python', () => {
    py.runPython('__COURSE_RUN_LIMIT = 1.0')
    const result = run('1A', { 'main.py': 'print("start")\nwhile True:\n    pass\n' })
    py.runPython('__COURSE_RUN_LIMIT = 20.0')
    expect(result.stopped).toBe(true)
    expect(result.output).toContain('start')
    expect(result.output).toContain('Stopped after')
    expect(run('1A', { 'main.py': 'print(1 + 1)\n' }).output).toBe('2\n')
  })

  it('feeds typed lines to a chat program, and ends the run when they are used up', () => {
    const files = solutionFiles('LAB-04', solutions['LAB-04'])
    const chat = run('LAB-04', files, ['What does the balance read?', 'quit'])
    expect(chat.output).toContain('What does the balance read?')
    expect(chat.output).toContain('Agent:')
    expect(chat.output).toContain('Goodbye')
    const cutShort = run('LAB-04', files, ['hello'])
    expect(cutShort.output).toContain('No more typed lines')
    expect(cutShort.output).not.toContain('Traceback')
  })

  it('reads a changed helper file again on the next run instead of a remembered copy', () => {
    const main = 'import helper\nprint(helper.VALUE)\n'
    expect(run('1A', { 'main.py': main, 'helper.py': 'VALUE = 1\n' }).output).toBe('1\n')
    expect(run('1A', { 'main.py': main, 'helper.py': 'VALUE = 2\n' }).output).toBe('2\n')
  })

  it('blocks the network while exercise code runs', () => {
    const program = ['import socket', 'try:', "    socket.create_connection(('example.com', 80), timeout=2)", "    print('connected')", 'except OSError:', "    print('blocked')"].join('\n')
    expect(run('1A', { 'main.py': program }).output).toBe('blocked\n')
  })

  it('leaves the ordinary scratchpad runner working afterwards', () => {
    expect(runWithPyodide(py, { code: 'print(input.__name__)\nprint(6 * 7)' }).stdout).toContain('42')
  })
})
