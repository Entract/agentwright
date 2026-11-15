import { describe, expect, it } from 'vitest'
import { exportAgent, fromHost, parseAgentFile, toBubbles, waitingPrompt, type Agent } from './store'

const agent: Agent = {
  id: 'ph-agent',
  name: 'pH agent',
  description: 'Reads a meter',
  main: 'agent.py',
  files: { 'agent.py': 'import tools\nprint("hi")', 'tools.py': 'X = 1', 'schedule.json': '{}' },
  created: 7,
  updated: 7,
  spentUsd: 0.5,
  skipped: 0,
}

describe('agents as the host program sends them', () => {
  it('turns the list of files into a lookup by name', () => {
    const [read] = fromHost([{ ...agent, files: [{ name: 'agent.py', text: 'print(1)' }, { name: 'notes.txt', text: 'hello' }] }])
    expect(read.files).toEqual({ 'agent.py': 'print(1)', 'notes.txt': 'hello' })
    expect(read.main).toBe('agent.py')
  })
})

describe('sharing an agent', () => {
  it('exports its files, which one runs and its name, and nothing else', () => {
    const file = JSON.parse(exportAgent(agent))
    expect(file).toEqual({ format: 'python-agent', version: 2, name: 'pH agent', description: 'Reads a meter', main: 'agent.py', files: agent.files })
    expect(parseAgentFile(exportAgent(agent), 'pH agent.agent.json')).toEqual({ name: 'pH agent', description: 'Reads a meter', main: 'agent.py', files: agent.files })
  })

  it('still reads the first version of the file, which held one program', () => {
    const old = JSON.stringify({ format: 'python-agent', version: 1, name: 'Old', description: '', code: 'print("hi")' })
    expect(parseAgentFile(old, 'old.agent.json')).toEqual({ name: 'Old', description: '', main: 'main.py', files: { 'main.py': 'print("hi")' } })
  })

  it('takes a .py file as the program, and refuses other files with a reason', () => {
    expect(parseAgentFile('print(1)\n', 'my_agent.py')).toEqual({ name: 'my_agent', description: '', main: 'my_agent.py', files: { 'my_agent.py': 'print(1)\n' } })
    expect(parseAgentFile('{"title": "a revision set"}', 'set.json')).toHaveProperty('problem')
    expect(parseAgentFile('hello', 'notes.json')).toHaveProperty('problem')
    expect(parseAgentFile('{"format": "python-agent", "code": " "}', 'x.agent.json')).toHaveProperty('problem')
  })

  it('refuses files that reach outside the folder, are not text, or name no script to run', () => {
    const make = (main: unknown, files: unknown) => JSON.stringify({ format: 'python-agent', version: 2, name: 'X', main, files })
    expect(parseAgentFile(make('a.py', { 'a.py': 'print(1)', '../evil.py': 'x' }), 'x.agent.json')).toHaveProperty('problem')
    expect(parseAgentFile(make('a.py', { 'a.py': 'print(1)', 'run.exe': 'x' }), 'x.agent.json')).toHaveProperty('problem')
    expect(parseAgentFile(make('a.py', { 'a.py': 'print(1)', 'b.json': 5 }), 'x.agent.json')).toHaveProperty('problem')
    expect(parseAgentFile(make('missing.py', { 'a.py': 'print(1)' }), 'x.agent.json')).toHaveProperty('problem')
    expect(parseAgentFile(make('data.json', { 'data.json': '{}' }), 'x.agent.json')).toHaveProperty('problem')
  })
})

describe('a running program shown as a conversation', () => {
  it('makes printed text the agent, typed text the learner, and drops the input prompt', () => {
    const bubbles = toBubbles([
      { kind: 'out', text: 'Ready.\nYou: ' },
      { kind: 'in', text: 'Read XPR204\n' },
      { kind: 'out', text: 'The balance reads 10.52 g.\nYou: ' },
      { kind: 'in', text: '\n' },
      { kind: 'out', text: 'bye\n' },
    ])
    expect(bubbles).toMatchObject([
      { who: 'agent', text: 'Ready.' },
      { who: 'you', text: 'Read XPR204' },
      { who: 'agent', text: 'The balance reads 10.52 g.' },
      { who: 'you', text: '' },
      { who: 'agent', text: 'bye' },
    ])
  })

  it('shows a traceback as an error, and knows the prompt the program is waiting at', () => {
    expect(toBubbles([{ kind: 'out', text: 'You: ' }, { kind: 'in', text: 'hi\n' }, { kind: 'err', text: 'Traceback...\nKeyError: 1\n' }])).toMatchObject([
      { who: 'you', text: 'hi' },
      { who: 'error', text: 'Traceback...\nKeyError: 1' },
    ])
    expect(waitingPrompt([{ kind: 'out', text: 'Ready.\nYou: ' }])).toBe('You: ')
    expect(waitingPrompt([{ kind: 'in', text: 'hi\n' }])).toBe('')
    expect(toBubbles([{ kind: 'out', text: 'Ready.\nYou: ' }], true)).toMatchObject([{ who: 'agent', text: 'Ready.' }])
    expect(toBubbles([{ kind: 'out', text: 'Ready.\nYou: ' }], false)).toMatchObject([{ who: 'agent', text: 'Ready.\nYou:' }])
  })
})

describe('the tool-call inspector', () => {
  it('reads tracer lines, ignores ordinary output, and sums an exchange', async () => {
    const { TRACE_MARK, readTrace, summarise, summaryLine } = await import('./trace')
    expect(readTrace('KeyError: 1')).toBeNull()
    expect(readTrace(TRACE_MARK + 'not json')).toBeNull()
    const usage = { input: 100, output: 20, cache_read: 50, cache_write: 0 }
    const first = readTrace(TRACE_MARK + JSON.stringify({ n: 1, ms: 40, request: { model: 'claude-opus-5-5', messages: 1, tools: ['read_balance'], results: [] }, response: { stop_reason: 'tool_use', text: '', calls: [{ id: 't1', name: 'read_balance', input: '{}', server: false }], usage, model: 'claude-opus-5-5' } }))!
    const second = readTrace(TRACE_MARK + JSON.stringify({ n: 2, ms: 30, request: { model: 'claude-opus-5-5', messages: 3, tools: ['read_balance'], results: [{ tool_use_id: 't1', content: 'no such balance', is_error: true }] }, response: { stop_reason: 'end_turn', text: 'Sorry.', calls: [], usage, model: 'claude-opus-5-5' } }))!
    const sum = summarise([first, second])
    expect(sum).toMatchObject({ calls: 2, tools: 1, toolErrors: 1, failed: 0, tokensIn: 300, tokensOut: 40, cached: 100 })
    expect(sum.costUsd).toBeGreaterThan(0)
    expect(summaryLine(sum)).toMatch(/^2 calls to Claude · 1 tool \(1 failed\) · 340 tokens · 100 from cache · about \$/)
  })
})
