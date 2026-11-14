// My Agents: programs the learner has saved to use as chatbots. This file is the data only:
// the saved list, the export file, and how a running program's output becomes a conversation.
import type { Chunk } from '../desktop/PcOutput'

export interface Agent {
  id: string
  name: string
  description: string
  code: string
  created: number
  updated: number
  /** Estimated total cost of the calls this agent has made from this window, in US dollars. */
  spentUsd?: number
}

export interface AgentStore {
  agents: Agent[]
}

export const emptyAgents = (): AgentStore => ({ agents: [] })

const isAgent = (a: unknown): a is Agent => {
  const v = a as Partial<Agent> | null
  return !!v && typeof v === 'object' && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.code === 'string'
}

/** Reads the saved list. Anything unreadable gives an empty list instead of an error. */
export function parseAgents(text: string | null): AgentStore {
  if (!text) return emptyAgents()
  try {
    const data = JSON.parse(text) as { agents?: unknown }
    if (!Array.isArray(data.agents)) return emptyAgents()
    return {
      agents: data.agents.filter(isAgent).map((a) => ({ ...a, description: typeof a.description === 'string' ? a.description : '', created: Number(a.created) || 0, updated: Number(a.updated) || 0 })),
    }
  } catch {
    return emptyAgents()
  }
}

/** A name not already in the list: "Balance agent", then "Balance agent 2", and so on. */
export function freeName(store: AgentStore, wanted: string): string {
  const base = wanted.trim() || 'Agent'
  const taken = new Set(store.agents.map((a) => a.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

export function addAgent(store: AgentStore, agent: { name: string; description?: string; code: string }, now: number): { store: AgentStore; agent: Agent } {
  const made: Agent = { id: `a${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, name: freeName(store, agent.name), description: agent.description ?? '', code: agent.code, created: now, updated: now }
  return { store: { agents: [...store.agents, made] }, agent: made }
}

export function changeAgent(store: AgentStore, id: string, change: Partial<Pick<Agent, 'name' | 'description' | 'code'>>, now: number): AgentStore {
  return { agents: store.agents.map((a) => (a.id === id ? { ...a, ...change, updated: now } : a)) }
}

export function addSpend(store: AgentStore, id: string, usd: number): AgentStore {
  return { agents: store.agents.map((a) => (a.id === id ? { ...a, spentUsd: (a.spentUsd ?? 0) + usd } : a)) }
}

export function removeAgent(store: AgentStore, id: string): AgentStore {
  return { agents: store.agents.filter((a) => a.id !== id) }
}

const FORMAT = 'python-agent'

/** The file one agent is shared as. It holds the program and its name: never a key, never a conversation. */
export function exportAgent(agent: Agent): string {
  return JSON.stringify({ format: FORMAT, version: 1, name: agent.name, description: agent.description, code: agent.code }, null, 2)
}

export function agentFileName(agent: Agent): string {
  return `${agent.name.replace(/[^\w -]+/g, '').trim() || 'agent'}.agent.json`
}

/** Reads a shared agent file, or a plain .py file, which is taken as the program itself. */
export function parseAgentFile(text: string, fileName = ''): { name: string; description: string; code: string } | { problem: string } {
  const plain = fileName.replace(/\.[^.]+$/, '') || 'Imported agent'
  if (/\.py$/i.test(fileName)) return text.trim() ? { name: plain, description: '', code: text } : { problem: 'That file is empty.' }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { problem: 'That file is not an agent file. An agent file ends in .agent.json, or is a .py program.' }
  }
  const v = data as { format?: unknown; name?: unknown; description?: unknown; code?: unknown } | null
  if (!v || typeof v !== 'object' || v.format !== FORMAT) return { problem: 'That file is not an agent file (it has no "format": "python-agent").' }
  if (typeof v.code !== 'string' || !v.code.trim()) return { problem: 'That agent file has no code in it.' }
  return { name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : plain, description: typeof v.description === 'string' ? v.description : '', code: v.code }
}

export interface Bubble {
  who: 'you' | 'agent' | 'error'
  text: string
  /** Which exchange this belongs to: 0 before anything was typed, then 1 from the first typed line, and so on. */
  turn: number
}

/**
 * Turns what a running program printed and was sent into a conversation. What it prints is the
 * agent speaking; what was typed is the learner. A prompt such as "You: " printed just before
 * the program waits for typing is left out, since the bubbles already say who is speaking.
 */
export function toBubbles(chunks: Chunk[], running = false): Bubble[] {
  const bubbles: Bubble[] = []
  let turn = 0
  chunks.forEach((chunk, i) => {
    let text = chunk.text
    // While the program runs, the unfinished line at the very end is the prompt it is waiting at.
    if (chunk.kind === 'out' && (chunks[i + 1]?.kind === 'in' || (running && i === chunks.length - 1))) {
      // Drop the unfinished last line: it is the prompt the program printed for input().
      const cut = text.lastIndexOf('\n')
      text = cut < 0 ? '' : text.slice(0, cut + 1)
    }
    text = text.replace(/^\s*\n/, '').replace(/\s+$/, '')
    if (chunk.kind === 'in') {
      turn += 1
      bubbles.push({ who: 'you', text, turn })
      return
    }
    if (!text) return
    const who = chunk.kind === 'err' ? 'error' : 'agent'
    const last = bubbles[bubbles.length - 1]
    if (last && last.who === who) last.text += `\n${text}`
    else bubbles.push({ who, text, turn })
  })
  return bubbles
}

/** The prompt a program is showing while it waits for typing, such as "You: ", if its output ends with one. */
export function waitingPrompt(chunks: Chunk[]): string {
  const last = chunks[chunks.length - 1]
  if (!last || last.kind !== 'out') return ''
  const tail = last.text.slice(last.text.lastIndexOf('\n') + 1)
  return tail.length <= 40 ? tail : ''
}

export const STARTER = `import anthropic

client = anthropic.Anthropic()
messages = []

while True:
    said = input("You: ")
    if not said:
        break
    messages.append({"role": "user", "content": said})
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=1024,
        system="You are a helpful lab assistant. Keep answers short.",
        messages=messages,
    )
    messages.append({"role": "assistant", "content": response.content})
    for block in response.content:
        if block.type == "text":
            print(block.text)
`

const STORE_KEY = 'my-agents-store'
const CHANGED = 'my-agents-changed'

export function loadAgents(): AgentStore {
  try {
    return parseAgents(localStorage.getItem(STORE_KEY))
  } catch {
    return emptyAgents()
  }
}

/** Saves the list and tells every open part of the window that it changed. False when storage refused it. */
export function saveAgents(store: AgentStore): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    return false
  }
  window.dispatchEvent(new Event(CHANGED))
  return true
}

export function onAgentsChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}

/** Adds a program to My Agents from elsewhere in the window (the Scratchpad, a passed question). Returns its name. */
export function saveAsAgent(name: string, code: string): string | null {
  const { store, agent } = addAgent(loadAgents(), { name, code }, Date.now())
  return saveAgents(store) ? agent.name : null
}
