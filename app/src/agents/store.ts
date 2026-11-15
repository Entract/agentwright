// My Agents: programs the learner has saved to use as chatbots. This file is the data only:
// what an agent is, the export file, and how a running program's output becomes a conversation.
// The agents themselves live on disk, one folder each, kept by the window's host program.
import type { Chunk } from '../desktop/PcOutput'
import { sendToHost, type HostAgent } from '../desktop/host'

export interface Agent {
  /** The name of the agent's folder. */
  id: string
  name: string
  description: string
  /** The Python file that runs when the agent is started. The other .py files are modules it imports. */
  main: string
  /** Every text file in the agent's folder, by name. */
  files: Record<string, string>
  created: number
  updated: number
  /** Estimated total cost of the calls this agent has made from this window, in US dollars. */
  spentUsd: number
  /** Files in the folder that are too large, or too many, to show as tabs. */
  skipped: number
}

export function fromHost(list: HostAgent[]): Agent[] {
  return list.map((a) => ({ ...a, files: Object.fromEntries(a.files.map((f) => [f.name, f.text])) }))
}

/** What is needed to make a new agent: its name and its files, one of which is the script that runs. */
export interface AgentDraft {
  name: string
  description: string
  main: string
  files: Record<string, string>
}

const FORMAT = 'python-agent'
const FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_ .-]{0,75}\.(py|json|txt|csv|md)$/i

/** The file one agent is shared as. It holds the agent's files and its name: never a key, never a conversation. */
export function exportAgent(agent: Agent): string {
  return JSON.stringify({ format: FORMAT, version: 2, name: agent.name, description: agent.description, main: agent.main, files: agent.files }, null, 2)
}

export function agentFileName(agent: Agent): string {
  return `${agent.name.replace(/[^\w -]+/g, '').trim() || 'agent'}.agent.json`
}

/** Reads a shared agent file, or a plain .py file, which is taken as the program itself. */
export function parseAgentFile(text: string, fileName = ''): AgentDraft | { problem: string } {
  const plain = fileName.replace(/\.[^.]+$/, '').replace(/\.agent$/i, '') || 'Imported agent'
  if (/\.py$/i.test(fileName)) {
    if (!text.trim()) return { problem: 'That file is empty.' }
    const main = FILE_NAME.test(fileName) ? fileName : 'main.py'
    return { name: plain, description: '', main, files: { [main]: text } }
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { problem: 'That file is not an agent file. An agent file ends in .agent.json, or is a .py program.' }
  }
  const v = data as { format?: unknown; name?: unknown; description?: unknown; code?: unknown; main?: unknown; files?: unknown } | null
  if (!v || typeof v !== 'object' || v.format !== FORMAT) return { problem: 'That file is not an agent file (it has no "format": "python-agent").' }
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim() : plain
  const description = typeof v.description === 'string' ? v.description : ''
  // The first version of the file held a single program.
  if (v.files === undefined) {
    if (typeof v.code !== 'string' || !v.code.trim()) return { problem: 'That agent file has no code in it.' }
    return { name, description, main: 'main.py', files: { 'main.py': v.code } }
  }
  if (!v.files || typeof v.files !== 'object' || Array.isArray(v.files)) return { problem: 'That agent file has no files in it.' }
  const files: Record<string, string> = {}
  for (const [file, content] of Object.entries(v.files as Record<string, unknown>)) {
    if (!FILE_NAME.test(file) || typeof content !== 'string') return { problem: `That agent file holds something that is not a plain text file: ${file.slice(0, 60)}` }
    files[file] = content
  }
  const main = typeof v.main === 'string' ? v.main : ''
  if (!/\.py$/i.test(main) || !(main in files) || !files[main].trim()) return { problem: 'That agent file does not say which Python file to run.' }
  return { name, description, main, files }
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

/** Asks the host program to make a new agent folder. The answer is an "agents" message naming what was created. */
export function createAgent(draft: AgentDraft): void {
  sendToHost({ type: 'agentCreate', ...draft })
}

/** Saves one program as an agent from elsewhere in the window (a passed question). Returns the name asked for. */
export function saveAsAgent(name: string, code: string): string {
  createAgent({ name, description: '', main: 'main.py', files: { 'main.py': code } })
  return name
}

const OLD_STORE_KEY = 'my-agents-store'

/** Agents saved by the first version of My Agents, which kept them inside the window. Null when there are none. */
export function oldAgents(): string | null {
  try {
    const text = localStorage.getItem(OLD_STORE_KEY)
    if (!text) return null
    const data = JSON.parse(text) as { agents?: unknown[] }
    if (Array.isArray(data.agents) && data.agents.length > 0) return text
    localStorage.removeItem(OLD_STORE_KEY)
    return null
  } catch {
    return null
  }
}

export function clearOldAgents(): void {
  try {
    localStorage.removeItem(OLD_STORE_KEY)
  } catch {
    // Nothing to clear.
  }
}
