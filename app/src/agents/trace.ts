// The tool-call inspector's data: what lab_trace.py reports about each call a running agent
// makes to the Anthropic API, and the sums shown beside each reply.
import { estimateCost } from '../tutor/anthropic'

/** Starts every report line that lab_trace.py writes to stderr. */
export const TRACE_MARK = '\u001eLABTRACE '

export interface TraceCall {
  id: string | null
  name: string
  /** The arguments Claude supplied, as JSON text. */
  input: string
  /** True for a tool Anthropic runs (such as web search), false for one the program runs. */
  server: boolean
}

export interface TraceResult {
  tool_use_id: string | null
  content: string
  is_error: boolean
}

export interface TraceEvent {
  n: number
  ms: number
  request: { model: string; messages: number; tools: string[]; results: TraceResult[] }
  response?: {
    stop_reason: string | null
    text: string
    calls: TraceCall[]
    usage: { input: number; output: number; cache_read: number; cache_write: number }
    model: string | null
  }
  /** The call failed: the exception as text. */
  error?: string
  /** The reply was streamed, so only the request is known. */
  streamed?: boolean
  note?: string
}

/** Reads one stderr line. Null when it is ordinary program output. */
export function readTrace(line: string): TraceEvent | null {
  if (!line.startsWith(TRACE_MARK)) return null
  try {
    const event = JSON.parse(line.slice(TRACE_MARK.length)) as TraceEvent
    return event && typeof event === 'object' && event.request ? event : null
  } catch {
    return null
  }
}

/** Estimated cost of one call in US dollars. Cache reads are charged at a tenth of the input price and cache writes at 1.25 times. */
export function callCost(event: TraceEvent): number {
  const usage = event.response?.usage
  if (!usage) return 0
  const model = event.response?.model || event.request.model
  return estimateCost(model, usage.input + usage.cache_write * 1.25 + usage.cache_read * 0.1, usage.output)
}

export interface TurnSummary {
  calls: number
  /** Tools the program ran for Claude, and how many of their results were errors. */
  tools: number
  toolErrors: number
  failed: number
  tokensIn: number
  tokensOut: number
  cached: number
  costUsd: number
}

export function summarise(events: TraceEvent[]): TurnSummary {
  const sum: TurnSummary = { calls: events.length, tools: 0, toolErrors: 0, failed: 0, tokensIn: 0, tokensOut: 0, cached: 0, costUsd: 0 }
  for (const event of events) {
    if (event.error) sum.failed += 1
    sum.tools += event.response?.calls.length ?? 0
    sum.toolErrors += event.request.results.filter((r) => r.is_error).length
    const usage = event.response?.usage
    if (usage) {
      sum.tokensIn += usage.input + usage.cache_read + usage.cache_write
      sum.tokensOut += usage.output
      sum.cached += usage.cache_read
    }
    sum.costUsd += callCost(event)
  }
  return sum
}

export function money(usd: number): string {
  if (usd === 0) return '$0'
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

/** One line under a reply, such as "2 calls to Claude · 1 tool · 350 tokens · about $0.0031". */
export function summaryLine(sum: TurnSummary): string {
  const parts = [`${sum.calls} call${sum.calls === 1 ? '' : 's'} to Claude`]
  if (sum.tools) parts.push(`${sum.tools} tool${sum.tools === 1 ? '' : 's'}${sum.toolErrors ? ` (${sum.toolErrors} failed)` : ''}`)
  if (sum.failed) parts.push(`${sum.failed} call${sum.failed === 1 ? '' : 's'} failed`)
  const tokens = sum.tokensIn + sum.tokensOut
  if (tokens) parts.push(`${tokens.toLocaleString('en-US')} tokens`)
  if (sum.cached) parts.push(`${sum.cached.toLocaleString('en-US')} from cache`)
  if (sum.costUsd) parts.push(`about ${money(sum.costUsd)}`)
  return parts.join(' · ')
}

/** Pretty-prints JSON text when it is JSON; otherwise returns it unchanged. */
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
