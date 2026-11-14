import type { RunResult } from '../runner/core'

const errorTitle = {
  syntax: 'Syntax error',
  runtime: 'Error while running',
  timeout: 'Stopped',
  internal: 'Runner problem',
} as const

/** Output, error and test results of one run. Never shows a reference solution. */
export default function RunOutput({ result }: { result: RunResult }) {
  const { error, stdout, tests } = result
  const passed = tests.filter((t) => t.passed).length
  return (
    <div data-testid="run-output">
      {stdout && (
        <>
          <h3>Output</h3>
          <pre className="code output">{stdout}</pre>
        </>
      )}
      {!stdout && !error && tests.length === 0 && <p className="muted">The program ran and printed nothing.</p>}
      {error && (
        <div className="notice bad">
          <strong>
            {errorTitle[error.kind]}
            {error.line ? ` on line ${error.line}` : ''}
          </strong>
          {error.kind === 'syntax' && (
            <p className="small muted">Python could not read the code, so nothing ran. This is a typing issue, not a logic one.</p>
          )}
          <pre className="code output" style={{ marginTop: 8 }}>{error.traceback || error.message}</pre>
        </div>
      )}
      {tests.length > 0 && (
        <>
          <h3>
            Tests: {passed} of {tests.length} passed
          </h3>
          <ul className="menu">
            {tests.map((t) => (
              <li key={t.name} className={`notice ${t.passed ? 'ok' : 'bad'}`}>
                <strong>{t.passed ? 'Passed' : 'Failed'}</strong>: {t.name}
                {!t.passed && (
                  <div className="small">
                    {t.call && (
                      <div>
                        Call: <code>{t.call}</code>
                      </div>
                    )}
                    {t.actual !== undefined && t.expected !== undefined && (
                      <div>
                        Got <code>{t.actual}</code>, expected <code>{t.expected}</code>
                      </div>
                    )}
                    {t.message && <pre className="code output" style={{ marginTop: 6 }}>{t.message}</pre>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
