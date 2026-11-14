// "Copy exercise context": everything a mentor needs to help with the exercise in front of the
// learner, as plain text for pasting into a chat. It never contains a key.
import { exercise } from './manifest'
import { STATUS_LABEL, statusOf, type CheckReport, type ExerciseProgress } from './progress'

/** Removes anything shaped like an API key, in case one was typed into the code. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '[key removed]')
    .replace(/(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|api_key)(\s*[=:]\s*)(["'])[^"'\n]{8,}\3/g, '$1$2$3[key removed]$3')
}

export function summariseReport(report: CheckReport | undefined): string[] {
  if (!report) return ['Tests: not run yet.']
  if (report.syntaxError) {
    const { file, line, message, text } = report.syntaxError
    return [`Tests: not run. Syntax error in ${file}${line ? ` line ${line}` : ''}: ${message}`, ...(text ? [`    ${text}`] : [])]
  }
  const lines = [`Tests: ${report.passed} of ${report.total} passed${report.timedOut ? ' (stopped: time limit)' : ''}.`]
  for (const c of report.cases) {
    lines.push(`  [${c.passed ? 'pass' : 'FAIL'}] ${c.visible ? '' : '(edge case) '}${c.name}${c.passed ? '' : `\n         ${c.message}`}`)
  }
  for (const point of report.explanation) lines.push(`  Explanation ${point.found ? 'mentions' : 'does not clearly mention'}: ${point.point}`)
  if (report.explanationMissing) lines.push('  A written explanation is still needed.')
  return lines
}

export function exerciseContext(id: string, state: ExerciseProgress, consoleOutput: string): string {
  const e = exercise(id)
  if (!e) return ''
  const lines = [
    `Python & Claude Agent Learning Lab: exercise ${e.id}, ${e.title}`,
    `Status: ${STATUS_LABEL[statusOf(state)]}. Hints shown: ${state.hints} of 3.${state.solutionShown ? ' Solution was shown.' : ''}`,
    '',
    `Task: ${e.task}`,
    `Already defined (fixtures): ${e.fixtures.length ? e.fixtures.join(', ') : 'none'}`,
    '',
  ]
  for (const [name, text] of Object.entries(state.files)) {
    if (name === 'fake_claude.py') continue // supplied by the app, long, and never the learner's work
    lines.push(`--- ${name} ---`, text.replace(/\s+$/, ''), '')
  }
  if (state.explanation.trim()) lines.push('--- my explanation ---', state.explanation.trim(), '')
  lines.push(...summariseReport(state.lastReport))
  if (consoleOutput.trim()) lines.push('', '--- last Run output ---', consoleOutput.trim().slice(-3000))
  return scrubSecrets(lines.join('\n'))
}
