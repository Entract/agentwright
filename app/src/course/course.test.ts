import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exerciseContext, scrubSecrets } from './context'
import { diffLines, diffSummary } from './diff'
import { DIMENSIONS, dimensionOf, EXERCISE_IDS, EXERCISES, FIXTURES, MILESTONES, milestonesAfter, MODULES, neighbour, parseExerciseId, prerequisite, PRIORITY_ROUTE } from './manifest'
import {
  blankExercise, carriedForward, emptyProgress, exerciseState, goTo, markDone, masterySummary, openExercise, parseProgress, recordCheck, recordRun, resetExercise,
  REVISIT_DELAY_MS, revisitSuggestion, setFile, showHint, showSolution, startFromReference, statusOf, timeToFirstPass, type CheckReport,
} from './progress'
import { WHY } from './why'

const report = (ok: boolean): CheckReport => ({
  exercise: '3C',
  syntaxError: null,
  cases: [{ name: 'results holds both', visible: true, passed: ok, message: ok ? '' : '`results` is []', concept: 'append' }],
  explanation: [],
  timedOut: false,
  passed: ok ? 1 : 0,
  total: 1,
  ok,
})
const T0 = 1_800_000_000_000

describe('the curriculum manifest', () => {
  it('keeps the 58 stable exercise IDs of the pack in order, with the added 3P and 7R exercises before 3A and 7A', () => {
    expect(EXERCISE_IDS).toEqual([
      '1A', '1B', '1C', '1D', '1E', '1F', '2A', '2B', '2C', '2D', '2E', '2F', '2G', '3P-A', '3P-B', '3P-C', '3P-D', '3P-E', '3P-F', '3A', '3B', '3C', '3D', '3E', '3F', '3G',
      '4A', '4B', '4C', '4D', '4E', '4F', '4G', '4H', '5A', '5B', '5C', '5D', '5E', '5F', '5G', '6A', '6B', '6C', '6D', '6E', '6F', '6G', '6H',
      '7R-A', '7R-B', '7R-C', '7R-D', '7R-E', '7R-F', '7A', '7B', '7C', '7D', '7E', '7F', '8A', '8B', '8C', '8D', '8E', '8F', '9A', '9B', '9C',
      ...MILESTONES,
    ])
    expect(MILESTONES).toEqual(['LAB-01', 'LAB-02', 'LAB-03', 'LAB-04', 'LAB-05', 'LAB-06', 'LAB-07', 'LAB-08', 'LAB-09', 'LAB-10', 'LAB-11', 'LAB-12'])
    expect(MODULES).toHaveLength(10)
  })

  it('gives every exercise three hints, known fixtures, a module and a why-it-matters note', () => {
    for (const e of EXERCISES) {
      expect(e.hints, e.id).toHaveLength(3)
      for (const f of e.fixtures) expect(FIXTURES[f], `${e.id} fixture ${f}`).toBeTypeOf('string')
      expect(MODULES.some((m) => m.id === e.module), e.id).toBe(true)
      expect(WHY[e.id], e.id).toBeTruthy()
      expect(DIMENSIONS.some((d) => d.id === dimensionOf(e)), e.id).toBe(true)
    }
    for (const id of PRIORITY_ROUTE) expect(EXERCISE_IDS).toContain(id)
  })

  it('understands what a mentor would say to open an exercise', () => {
    expect(parseExerciseId('open 4a')).toBe('4A')
    expect(parseExerciseId("I'm on exercise 3C")).toBe('3C')
    expect(parseExerciseId('3 c')).toBe('3C')
    expect(parseExerciseId('open 3p-b')).toBe('3P-B')
    expect(parseExerciseId('3P D')).toBe('3P-D')
    expect(parseExerciseId('3pf')).toBe('3P-F')
    expect(parseExerciseId('open 7r-c')).toBe('7R-C')
    expect(parseExerciseId('7R E')).toBe('7R-E')
    expect(parseExerciseId('lab 4')).toBe('LAB-04')
    expect(parseExerciseId('open LAB-08')).toBe('LAB-08')
    expect(parseExerciseId('lab99')).toBeNull()
    expect(parseExerciseId('9Z')).toBeNull()
    expect(parseExerciseId('hello')).toBeNull()
  })

  it('walks between exercises and names the one each builds on', () => {
    expect(neighbour('3C', 1)).toBe('3D')
    expect(neighbour('3G', 1)).toBe('4A')
    expect(neighbour('1A', -1)).toBeNull()
    expect(neighbour('9C', 1)).toBe('LAB-01')
    expect(neighbour(MILESTONES[MILESTONES.length - 1], 1)).toBeNull()
    expect(neighbour('3C', 1, (id) => id.startsWith('4'))).toBe('4A')
    expect(prerequisite('3C')).toBe('3B')
    expect(prerequisite('4A')).toBeNull()
  })
})

describe('course progress', () => {
  it('starts at 3C with the starter code and nothing recorded', () => {
    const p = emptyProgress()
    expect(p.current).toBe('3C')
    const s = exerciseState(p, '3C')
    expect(s.files['main.py']).toContain('results = []')
    expect(statusOf(p.exercises['3C'])).toBe('new')
  })

  it('counts a pass with no hints as independent, and with a hint or shown solution as helped', () => {
    let p = openExercise(emptyProgress(), '3C', T0)
    p = recordCheck(p, '3C', report(false), T0 + 1000)
    expect(statusOf(p.exercises['3C'])).toBe('started')
    p = recordCheck(p, '3C', report(true), T0 + 60_000)
    expect(statusOf(p.exercises['3C'])).toBe('independent')
    expect(timeToFirstPass(p.exercises['3C'])).toBe(60_000)
    expect(p.exercises['3C'].lastPassedFiles).toEqual(p.exercises['3C'].files)

    let helped = showHint(openExercise(emptyProgress(), '4A', T0), '4A', 1)
    helped = recordCheck(helped, '4A', report(true), T0 + 5000)
    expect(statusOf(helped.exercises['4A'])).toBe('helped')

    let revealed = showSolution(openExercise(emptyProgress(), '4B', T0), '4B')
    revealed = recordCheck(revealed, '4B', report(true), T0 + 5000)
    expect(statusOf(revealed.exercises['4B'])).toBe('helped')
  })

  it('marks a concept secure only after a later pass without help', () => {
    let p = showHint(openExercise(emptyProgress(), '3C', T0), '3C', 2)
    p = recordCheck(p, '3C', report(true), T0)
    expect(revisitSuggestion(p, T0 + 1000)).toBeNull()
    expect(revisitSuggestion(p, T0 + REVISIT_DELAY_MS)).toBe('3C')

    // Same day, after a reset and without hints: independent, but not yet secure.
    p = resetExercise(p, '3C')
    expect(p.exercises['3C'].hints).toBe(0)
    expect(p.exercises['3C'].files['main.py']).toContain('# Execute requested tool')
    p = recordCheck(p, '3C', report(true), T0 + 3600_000)
    expect(statusOf(p.exercises['3C'])).toBe('independent')

    p = recordCheck(p, '3C', report(true), T0 + REVISIT_DELAY_MS + 1)
    expect(statusOf(p.exercises['3C'])).toBe('secure')
    expect(revisitSuggestion(p, T0 + 10 * REVISIT_DELAY_MS)).toBeNull()
  })

  it('treats a mentor override as done, never as passed on your own', () => {
    const p = markDone(openExercise(emptyProgress(), '3B', T0), '3B', T0)
    expect(statusOf(p.exercises['3B'])).toBe('marked')
    const writing = masterySummary(p).find((d) => d.id === 'writing')!
    expect(writing.passed).toBe(0)
    expect(writing.independent).toBe(0)
  })

  it('logs runs and checks with the hint tier in use, and caps the log', () => {
    let p = openExercise(emptyProgress(), '3C', T0)
    p = recordRun(p, '3C', T0 + 1)
    p = showHint(p, '3C', 1)
    p = recordCheck(p, '3C', report(false), T0 + 2)
    expect(p.exercises['3C'].attempts.map((a) => [a.kind, a.hints])).toEqual([['run', 0], ['check', 1]])
    for (let i = 0; i < 100; i++) p = recordRun(p, '3C', T0 + 10 + i)
    expect(p.exercises['3C'].attempts.length).toBe(60)
  })

  it('survives a save and reload, and ignores damaged or foreign data', () => {
    let p = openExercise(emptyProgress(), '4D', T0)
    p = setFile(p, '4D', 'main.py', 'import json\n# my work\n')
    p = recordCheck(p, '4D', report(true), T0 + 5)
    const restored = parseProgress(JSON.stringify(p))!
    expect(restored.current).toBe('4D')
    expect(restored.exercises['4D'].files['main.py']).toBe('import json\n# my work\n')
    expect(statusOf(restored.exercises['4D'])).toBe('independent')

    expect(parseProgress('not json')).toBeNull()
    expect(parseProgress('{"exercises": 3}')).toBeNull()
    const odd = parseProgress(JSON.stringify({ current: 'ZZ', exercises: { '9Z': blankExercise('3C'), '3C': { files: { 'main.py': 'x' }, hints: 99 } } }))!
    expect(odd.current).toBe('3C')
    expect(Object.keys(odd.exercises)).toEqual(['3C'])
    expect(odd.exercises['3C'].hints).toBe(3)
  })
})

describe('the agent project', () => {
  const passed = 'def reply(question):\n    return "You said: " + question\n'

  it('opens a milestone with the code that passed the one before, under one banner line', () => {
    const carried = carriedForward(passed, 'LAB-02')
    expect(carried.split('\n')[0]).toMatch(/^# Now: LAB-02 - .+\. The task is on the left\.$/)
    expect(carried.endsWith(passed)).toBe(true)
    // Carrying it again replaces the banner instead of stacking another.
    const again = carriedForward(carried, 'LAB-03')
    expect(again.split('\n').filter((line) => line.startsWith('# Now: '))).toHaveLength(1)
    expect(again.split('\n')[0]).toContain('LAB-03')
    expect(again.endsWith(passed)).toBe(true)
  })

  it('remembers what a milestone started from, and resets back to it', () => {
    const files = { 'agent.py': carriedForward(passed, 'LAB-02') }
    let p = openExercise(emptyProgress(), 'LAB-02', T0, files, 'agent.py')
    expect(p.exercises['LAB-02'].startedFrom).toBe(files['agent.py'])
    p = setFile(p, 'LAB-02', 'agent.py', 'print("changed")\n')
    p = resetExercise(p, 'LAB-02', files, 'agent.py')
    expect(p.exercises['LAB-02'].files['agent.py']).toBe(files['agent.py'])
    expect(parseProgress(JSON.stringify(p))?.exercises['LAB-02'].startedFrom).toBe(files['agent.py'])
    expect(openExercise(emptyProgress(), '3C', T0).exercises['3C'].startedFrom).toBeUndefined()
  })

  it('moves to a locked milestone without saving anything for it', () => {
    const p = goTo(emptyProgress(), 'LAB-05')
    expect(p.current).toBe('LAB-05')
    expect(p.exercises['LAB-05']).toBeUndefined()
  })

  it('counts a milestone started from a reference version as passed with help', () => {
    let p = startFromReference(emptyProgress(), 'LAB-05', { 'agent.py': 'x = 1\n' }, 'agent.py', T0)
    expect(p.current).toBe('LAB-05')
    p = recordCheck(p, 'LAB-05', report(true), T0 + 1000)
    expect(statusOf(p.exercises['LAB-05'])).toBe('helped')
  })

  it('suggests each milestone after a numbered exercise that exists', () => {
    for (const id of MILESTONES) {
      const after = EXERCISES.find((e) => e.id === id)?.after
      expect(after && EXERCISE_IDS.includes(after), id).toBe(true)
      expect(milestonesAfter(after as string)).toContain(id)
    }
  })

  it('shows what changed between two versions line by line', () => {
    const lines = diffLines('a\nb\nc\n', 'a\nx\nc\nd\n')
    expect(lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'same', text: 'c' },
      { kind: 'added', text: 'd' },
    ])
    expect(diffSummary(lines)).toEqual({ added: 2, removed: 1 })
    expect(diffSummary(diffLines('same\n', 'same\n\n'))).toEqual({ added: 0, removed: 0 })
  })
})

describe('copy exercise context', () => {
  it('contains the ID, task, fixtures, code and test summary a mentor needs', () => {
    let p = openExercise(emptyProgress(), '3C', T0)
    p = setFile(p, '3C', 'main.py', 'results = []\nprint(results)\n')
    p = recordCheck(p, '3C', report(false), T0 + 5)
    const text = exerciseContext('3C', p.exercises['3C'], 'Traceback...\nNameError: name x')
    expect(text).toContain('exercise 3C, Capture results rather than print')
    expect(text).toContain('Task: Create list `results`')
    expect(text).toContain('sdk_message, simulated_instruments')
    expect(text).toContain('results = []\nprint(results)')
    expect(text).toContain('Tests: 0 of 1 passed')
    expect(text).toContain('[FAIL] results holds both')
    expect(text).toContain('NameError: name x')
  })

  it('never includes anything shaped like an API key', () => {
    const leaked = 'client = anthropic.Anthropic(api_key="sk-ant-api03-abcdefghijklmnop")\nANTHROPIC_API_KEY = "abcdefgh12345678"\n'
    expect(scrubSecrets(leaked)).not.toMatch(/abcdefgh/)
    let p = openExercise(emptyProgress(), '5G', T0)
    p = setFile(p, '5G', 'main.py', leaked)
    expect(exerciseContext('5G', p.exercises['5G'], 'sk-ant-api03-zzzzzzzzzzzzzzzz')).not.toMatch(/abcdefgh|zzzzzzzz/)
  })
})

describe('the Python checker', () => {
  it('passes its own self-test: solutions pass, starters and known misconceptions fail', () => {
    const folder = resolve('../desktop/curriculum')
    let output = ''
    try {
      output = execFileSync('python', ['-m', 'unittest', 'test_labcheck'], { cwd: folder, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 280000 })
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string }
      throw new Error(`labcheck self-test failed:\n${e.stderr ?? ''}\n${e.stdout ?? ''}`)
    }
    expect(output).toBeDefined()
  }, 300000)
})
