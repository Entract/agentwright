// Pieces of the guided course shared by the PC window and the phone app.
import { useMemo, type ReactNode } from 'react'
import type { CourseInfo } from '../desktop/host'
import { diffLines, diffSummary } from './diff'
import { EXERCISES, MODULES, exercise, onPriorityRoute, type Brief } from './manifest'
import { STATUS_LABEL, carriedForward, masterySummary, revisitSuggestion, statusOf, type CheckReport, type Progress, type Status } from './progress'

/** Text from the manifest with `code spans` rendered as code. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => (part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>))}
    </>
  )
}

/** The first part of a briefing, shown above the task: what is going on. */
export function BriefIntro({ brief }: { brief: Brief }) {
  return (
    <>
      <h2>What is going on</h2>
      <div className="lesson" data-testid="brief-intro">
        {brief.story.map((paragraph, i) => (
          <p key={i}>
            <Inline text={paragraph} />
          </p>
        ))}
      </div>
    </>
  )
}

/** The rest of a briefing, shown under the task. `codeWhere` says where the supplied code can be read. */
export function BriefDetail({ brief, codeWhere }: { brief: Brief; codeWhere: string }) {
  return (
    <div data-testid="brief-detail">
      <h2>What you produce</h2>
      <p>
        <Inline text={brief.make} />
      </p>

      <h2>What Check tries</h2>
      <p className="muted small">Check runs your code once for each line below, and nothing else. An answer that only fits the first line fails the others.</p>
      <ul className="examples">
        {brief.examples.map((example, i) => (
          <li key={i}>
            <div className="when">
              <Inline text={example.when} />
            </div>
            <div className="then">
              <Inline text={example.then} />
            </div>
          </li>
        ))}
      </ul>
      {brief.examples_note && (
        <p className="muted small">
          <Inline text={brief.examples_note} />
        </p>
      )}

      <h2>What already exists</h2>
      <p className="muted small">These are defined before your code runs. You use them; you do not write them. {codeWhere}</p>
      <dl className="given">
        {brief.given.map((item) => (
          <div key={item.name}>
            <dt>
              <code>{item.name}</code>
            </dt>
            <dd>
              <Inline text={item.what} />
            </dd>
          </div>
        ))}
      </dl>

      <h2>Python you need here</h2>
      <p className="muted small">Small examples about something else, so that the exercise is still yours to write.</p>
      {brief.python.map((item, i) => (
        <div key={i} className="python-point">
          <p>
            <Inline text={item.point} />
          </p>
          {item.code && <pre className="code">{item.code}</pre>}
        </div>
      ))}

      {brief.tryit && (
        <>
          <h2>Try it</h2>
          <p className="muted small">Put these lines under your code and press Run to see what your code does. Leaving them in does not affect Check.</p>
          <pre className="code">{brief.tryit}</pre>
        </>
      )}
    </div>
  )
}

/** The file to show first: the agent itself in a multi-file project, otherwise the program that Run executes. */
export function firstFile(workspace: { files?: Record<string, string>; entry?: string } | undefined): string {
  if (workspace?.files && 'agent.py' in workspace.files) return 'agent.py'
  return workspace?.entry ?? 'main.py'
}

/**
 * What an exercise opens with. A project milestone opens with the learner's own passing code from
 * the milestone before it; until that exists the milestone is locked and has no saved state.
 */
export function startingPoint(id: string, info: CourseInfo | null, progress: Progress, where?: string): { files?: Record<string, string>; entry?: string; locked: boolean } {
  const ws = info?.workspaces[id]
  if (!ws?.previous) return { files: ws?.files, entry: ws?.entry, locked: false }
  const entry = ws.entry ?? 'main.py'
  const carried = progress.exercises[ws.previous]?.lastPassedFiles?.[entry]
  if (carried === undefined) return { files: ws.files, entry, locked: !progress.exercises[id] }
  return { files: { [entry]: carriedForward(carried, id, where), ...(ws.files ?? {}) }, entry, locked: false }
}

function withoutBanner(code: string): string {
  return code
    .split('\n')
    .filter((line) => !line.startsWith('# Now: '))
    .join('\n')
}

/** What changed in the learner's program since this milestone was opened. */
export function Changes({ before, after, since }: { before: string; after: string; since: string }) {
  // The one-line banner naming the milestone is the app's, not a change the learner made.
  const lines = useMemo(() => diffLines(withoutBanner(before), withoutBanner(after)), [before, after])
  const { added, removed } = diffSummary(lines)
  if (added === 0 && removed === 0) return <p className="muted">No changes yet since {since}.</p>
  return (
    <div data-testid="changes">
      <p className="muted small">
        Since {since}: {added} line{added === 1 ? '' : 's'} added, {removed} removed.
      </p>
      <pre className="code diff">
        {lines.map((line, i) => (
          <span key={i} className={`diff-${line.kind}`}>
            {(line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  ') + line.text + '\n'}
          </span>
        ))}
      </pre>
    </div>
  )
}

export const STATUS_MARK: Record<Status, string> = { new: '', started: '…', marked: '✓', helped: '✓', independent: '✓', secure: '★' }

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip status-${status}`}>{STATUS_LABEL[status]}</span>
}

export function TestReport({ report }: { report: CheckReport }) {
  if (report.syntaxError) {
    const { file, line, message, text } = report.syntaxError
    return (
      <div className="notice bad" data-testid="course-report">
        <strong>
          Python could not read {file}
          {line ? `, line ${line}` : ''}
        </strong>
        <p className="small muted">Nothing was run. This is a typing issue (a missing colon, bracket or quote), not a logic one.</p>
        <pre className="code output">{`${text ? text + '\n' : ''}${message}`}</pre>
      </div>
    )
  }
  return (
    <div data-testid="course-report">
      <p className={report.ok ? 'course-pass' : 'course-fail'}>
        <strong>
          {report.ok ? 'All checks passed' : `${report.passed} of ${report.total} checks passed`}
          {report.timedOut ? ' (stopped at the time limit: is there a loop that never ends?)' : ''}
        </strong>
      </p>
      <ul className="cases">
        {report.cases.map((c) => (
          <li key={c.name} className={c.passed ? 'case ok' : 'case bad'}>
            <span className="case-mark">{c.passed ? 'Passed' : 'Failed'}</span> <Inline text={c.name} />
            {!c.visible && <span className="muted small"> · edge case</span>}
            {!c.passed && c.message && (
              <div className="case-detail">
                <Inline text={c.message} />
                {c.concept && (
                  <div className="muted small">
                    Idea to check: <Inline text={c.concept} />
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {report.explanation.length > 0 && (
        <div className="small">
          <strong>Your written explanation</strong> <span className="muted">(a rough keyword check; your mentor's judgement overrides it)</span>
          <ul className="cases">
            {report.explanation.map((p) => (
              <li key={p.point} className={p.found ? 'case ok' : 'case warn'}>
                {p.found ? 'Mentions: ' : 'Not clearly found: '}
                {p.point}
              </li>
            ))}
          </ul>
          {report.explanationMissing && <p className="course-fail">Write your explanation (a sentence or two) in the box under the task, then check again.</p>}
        </div>
      )}
    </div>
  )
}

export function CourseMap({ progress, info, onOpen, footer }: { progress: Progress; info: CourseInfo | null; onOpen: (id: string) => void; footer?: ReactNode }) {
  const revisit = revisitSuggestion(progress, Date.now())
  const summary = masterySummary(progress)
  return (
    <div className="course-map">
      <h2>All exercises</h2>
      {revisit && (
        <p className="notice">
          Worth a revisit without hints: <button className="linkish" onClick={() => onOpen(revisit)}>{revisit} — {exercise(revisit)?.title}</button>. Solving it again on your own marks it secure.
        </p>
      )}
      {MODULES.map((m) => (
        <section key={m.id}>
          <h3>
            {m.id}. {m.name}
          </h3>
          <p className="muted small">{m.goal}</p>
          <div className="map-grid">
            {EXERCISES.filter((e) => e.module === m.id).map((e) => {
              const status = statusOf(progress.exercises[e.id])
              const ready = !info || info.implemented.includes(e.id)
              return (
                <button key={e.id} className={`map-item status-${status}${e.id === progress.current ? ' current' : ''}`} onClick={() => onOpen(e.id)} title={`${STATUS_LABEL[status]}${ready ? '' : ' · tests not built yet'}`}>
                  <span className="map-id">
                    {e.id} {STATUS_MARK[status]}
                  </span>
                  <span className="map-title">{e.title}</span>
                  <span className="muted small">
                    {onPriorityRoute(e.id) ? 'core route' : 'extra'}
                    {ready ? '' : ' · no tests yet'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <h3>Evidence by skill</h3>
      <table className="mastery">
        <thead>
          <tr>
            <th>Skill</th>
            <th>Passed</th>
            <th>On your own</th>
            <th>Secure</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((d) => (
            <tr key={d.id}>
              <td>{d.label}</td>
              <td>
                {d.passed} of {d.total}
              </td>
              <td>{d.independent}</td>
              <td>{d.secure}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        "Secure" needs a second pass without hints at least 20 hours after the first. A revealed solution or a mentor's "mark done" never counts as passing on your own.
      </p>
      {footer}
    </div>
  )
}
