import { describe, expect, it } from 'vitest'
import { addAgent, changeAgent, emptyAgents, exportAgent, freeName, parseAgentFile, parseAgents, removeAgent, toBubbles, waitingPrompt } from './store'

describe('the saved list of agents', () => {
  it('adds, renames and removes, and never reuses a name', () => {
    let { store, agent } = addAgent(emptyAgents(), { name: 'Balance agent', code: 'print(1)' }, 1000)
    const second = addAgent(store, { name: 'Balance agent', code: 'print(2)' }, 2000)
    store = second.store
    expect(second.agent.name).toBe('Balance agent 2')
    expect(freeName(store, 'balance AGENT')).toBe('balance AGENT 3')
    store = changeAgent(store, agent.id, { code: 'print(3)' }, 3000)
    expect(store.agents[0]).toMatchObject({ code: 'print(3)', created: 1000, updated: 3000 })
    expect(removeAgent(store, agent.id).agents.map((a) => a.name)).toEqual(['Balance agent 2'])
  })

  it('reads back what it saved, and treats anything unreadable as empty', () => {
    const { store } = addAgent(emptyAgents(), { name: 'A', code: 'x = 1' }, 5)
    expect(parseAgents(JSON.stringify(store))).toEqual(store)
    expect(parseAgents('not json')).toEqual(emptyAgents())
    expect(parseAgents(JSON.stringify({ agents: [{ id: 1 }, { id: 'ok', name: 'B', code: '' }] })).agents.map((a) => a.name)).toEqual(['B'])
  })
})

describe('sharing an agent', () => {
  it('exports the program and its name, and nothing else', () => {
    const { agent } = addAgent(emptyAgents(), { name: 'pH agent', description: 'Reads a meter', code: 'print("hi")' }, 7)
    const file = JSON.parse(exportAgent(agent))
    expect(file).toEqual({ format: 'python-agent', version: 1, name: 'pH agent', description: 'Reads a meter', code: 'print("hi")' })
    expect(parseAgentFile(exportAgent(agent), 'whatever.agent.json')).toEqual({ name: 'pH agent', description: 'Reads a meter', code: 'print("hi")' })
  })

  it('takes a .py file as the program, and refuses other files with a reason', () => {
    expect(parseAgentFile('print(1)\n', 'my_agent.py')).toEqual({ name: 'my_agent', description: '', code: 'print(1)\n' })
    expect(parseAgentFile('{"title": "a revision set"}', 'set.json')).toHaveProperty('problem')
    expect(parseAgentFile('hello', 'notes.json')).toHaveProperty('problem')
    expect(parseAgentFile('{"format": "python-agent", "code": " "}', 'x.agent.json')).toHaveProperty('problem')
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
