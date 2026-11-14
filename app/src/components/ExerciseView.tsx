import { useEffect, useRef, useState } from 'react'
import type { Attempt, Exercise, ReviewCard } from '../types'
import { gradeChoice, gradeCode, gradeOutput, gradeText, pyRepr, type Grade } from '../learn/grade'
import { recordAttempt, regradeAttempt, scheduleReviewFor } from '../learn/store'
import { db } from '../db/db'
import { getRunner } from '../runner/client'
import type { RunResult } from '../runner/core'
import { getTutor } from '../tutor'
import { sdkClient } from '../tutor/anthropic'
import { addUsage, getDailyUsage, getTutorConfig, loadApiKey, overLimit } from '../tutor/settings'
import { generateVariant } from '../tutor/variant'
import type { TutorFeedback } from '../tutor/provider'
import CodeEditor from './CodeEditor'
import RunOutput from './RunOutput'
import TutorChat from './TutorChat'

const MODE_LABEL: Record<Exercise['mode'], string> = {
  predict: 'Predict',
  explain: 'Explain',
  fix: 'Fix',
  complete: 'Complete',
  write: 'Write',
}

const VERDICT_LABEL = { correct: 'Correct', partial: 'Partly correct', incorrect: 'Not yet' } as const

export interface ExerciseOutcome {
  exercise: Exercise
  attempts: Attempt[]
  /** Review card added or brought forward because the concept was missed. */
  card: ReviewCard | null
}

interface Props {
  exercise: Exercise
  sessionId?: number
  /** Called with a freshly generated variant, when the host can open it. */
  onVariant?: (variant: Exercise) => void
  /** Code to start from instead of the starter, for example an earlier attempt. */
  initialAnswer?: string
  nextLabel?: string
  onNext: (outcome: ExerciseOutcome) => void
}

function evidenceOf(result: RunResult): string {
  if (result.error) return result.error.traceback || result.error.message
  const failed = result.tests.find((t) => !t.passed)
  if (!failed) return ''
  return [failed.name, failed.call, failed.actual !== undefined ? `got ${failed.actual}, expected ${failed.expected}` : '', failed.message]
    .filter(Boolean)
    .join(' | ')
}

/** One exercise: the question, an answer field for its kind, and the retry / hint / reveal ladder. */
export default function ExerciseView({ exercise, sessionId, initialAnswer, nextLabel = 'Next', onNext, onVariant }: Props) {
  const isCode = exercise.answer === 'code'
  const [answer, setAnswer] = useState(initialAnswer ?? exercise.starterCode ?? '')
  const [choice, setChoice] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<1 | 2 | 3 | undefined>(undefined)
  const [hintsShown, setHintsShown] = useState(0)
  const [showTrace, setShowTrace] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [feedback, setFeedback] = useState<TutorFeedback | null>(null)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState<'run' | 'check' | null>(null)
  const [regraded, setRegraded] = useState<'typo' | 'misread' | null>(null)
  const [aiOn, setAiOn] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  const [variantState, setVariantState] = useState<{ busy: boolean; error?: string }>({ busy: false })
  const attemptIds = useRef<number[]>([])
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isCode) getRunner().warm()
  }, [isCode])

  useEffect(() => {
    getTutorConfig().then((c) => setAiOn(c.enabled)).catch(() => setAiOn(false))
  }, [])

  const request = () => ({ code: answer, files: exercise.files, given: exercise.given })

  /** Asks the AI tutor for a variant; it is only kept if real Python runs it and produces output. */
  async function makeVariant() {
    setVariantState({ busy: true })
    try {
      const config = await getTutorConfig()
      const key = await loadApiKey()
      if (!key) throw new Error('No API key is saved.')
      if (overLimit(config, await getDailyUsage())) throw new Error('Today’s AI spending limit is reached.')
      const client = sdkClient(key)
      const { exercise: variant, usage } = await generateVariant(
        exercise,
        { create: (body) => client.beta.messages.create(body) },
        config.model,
        (r) => getRunner().run(r),
      )
      await addUsage(usage, sessionId)
      await db.exercises.put(variant)
      setVariantState({ busy: false })
      onVariant?.(variant)
    } catch (err) {
      const usage = (err as { usage?: Parameters<typeof addUsage>[0] }).usage
      if (usage) await addUsage(usage, sessionId)
      setVariantState({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function run() {
    setBusy('run')
    setFeedback(null)
    setRunResult(await getRunner().run(request()))
    setBusy(null)
  }

  async function check() {
    setBusy('check')
    setRegraded(null)
    let grade: Grade
    let result: RunResult | null = null
    let submitted = answer
    if (isCode) {
      result = await getRunner().run({ ...request(), tests: exercise.tests })
      setRunResult(result)
      grade = gradeCode(result)
    } else if (exercise.answer === 'choice') {
      grade = gradeChoice(exercise, choice)
      submitted = choice === null ? '' : exercise.choices![choice]
    } else if (exercise.answer === 'text') {
      grade = gradeText(exercise, answer)
    } else {
      grade = gradeOutput(exercise, answer)
    }
    const { tutor, note: tutorNote } = await getTutor(sessionId)
    const reply = await tutor.feedback({
      exercise,
      answer: submitted,
      grade,
      attemptNumber: attemptIds.current.length + 1,
      hintsShown,
      evidence: result ? evidenceOf(result) : undefined,
    })
    const fb = tutorNote && !reply.note ? { ...reply, note: tutorNote } : reply
    const helped = hintsShown > 0 || showTrace || revealed || asked
    const id = await recordAttempt({
      exerciseId: exercise.id,
      exerciseVersion: exercise.version,
      sessionId,
      ts: Date.now(),
      mode: exercise.mode,
      submitted,
      runResult: result ? JSON.stringify(result) : undefined,
      verdict: fb.verdict,
      reasoning: grade.reasoning,
      errorClass: fb.errorType,
      hintsUsed: hintsShown,
      revealed,
      independent: exercise.mode === 'write' && !exercise.starterCode && !helped,
      confidence,
      feedback: fb.smallestHint,
    }, db, exercise)
    attemptIds.current.push(id)
    setFeedback(fb)
    setBusy(null)
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  async function regrade(kind: 'typo' | 'misread') {
    const id = attemptIds.current[attemptIds.current.length - 1]
    if (id === undefined) return
    await regradeAttempt(id, kind)
    setRegraded(kind)
  }

  async function next() {
    const attempts = (await db.attempts.bulkGet(attemptIds.current)).filter((a): a is Attempt => !!a)
    const card = await scheduleReviewFor(exercise, attempts)
    onNext({ exercise, attempts, card })
  }

  const done = feedback?.verdict === 'correct'
  const wrong = feedback !== null && !done
  const canCheck = busy === null && (exercise.answer === 'choice' ? choice !== null : answer.trim() !== '')

  return (
    <article>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="tag">{MODE_LABEL[exercise.mode]}</span>
        <h2 style={{ margin: 0 }}>{exercise.title}</h2>
      </div>

      {exercise.newSyntax?.map((s) => (
        <div className="notice" key={s}>
          <strong>New here:</strong> {s}
        </div>
      ))}

      <p style={{ whiteSpace: 'pre-wrap' }}>{exercise.prompt}</p>
      {exercise.code && <pre className="code">{exercise.code}</pre>}

      {exercise.given && (
        <>
          <div className="muted">Already defined for you:</div>
          <pre className="code">
            {Object.entries(exercise.given)
              .map(([name, value]) => `${name} = ${pyRepr(value)}`)
              .join('\n')}
          </pre>
        </>
      )}

      {exercise.answer === 'output' && (
        <>
          <label htmlFor="answer">Your prediction</label>
          <textarea
            id="answer"
            className="mono"
            rows={Math.min(8, Math.max(3, (exercise.expectedOutput ?? '').split('\n').length + 1))}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </>
      )}

      {exercise.answer === 'text' && (
        <>
          <label htmlFor="answer">Your explanation, in your own words</label>
          <textarea id="answer" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </>
      )}

      {exercise.answer === 'choice' && (
        <div role="radiogroup" aria-label="Options">
          {exercise.choices!.map((text, i) => (
            <label key={i} className={`choice ${choice === i ? 'selected' : ''}`}>
              <input type="radio" name="choice" checked={choice === i} onChange={() => setChoice(i)} />
              <span>{text}</span>
            </label>
          ))}
        </div>
      )}

      {isCode && <CodeEditor value={answer} onChange={setAnswer} />}

      {isCode &&
        exercise.files &&
        Object.entries(exercise.files).map(([name, content]) => (
          <details key={name} style={{ marginTop: 8 }} open>
            <summary className="muted">{name} (provided, read-only)</summary>
            <pre className="code">{content}</pre>
          </details>
        ))}
      {!isCode &&
        exercise.files &&
        Object.entries(exercise.files).map(([name, content]) => (
          <div key={name}>
            <div className="muted">{name}</div>
            <pre className="code">{content}</pre>
          </div>
        ))}

      {!isCode && (
        <div className="row" style={{ margin: '10px 0' }}>
          <span className="muted">How sure are you?</span>
          {([[3, 'Sure'], [2, 'Fairly'], [1, 'Guessing']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={confidence === value ? 'primary' : 'quiet'}
              style={{ minHeight: 36, padding: '4px 10px' }}
              aria-pressed={confidence === value}
              onClick={() => setConfidence(confidence === value ? undefined : value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="row" style={{ margin: '12px 0' }}>
        {isCode && (
          <button type="button" onClick={run} disabled={busy !== null || answer.trim() === ''}>
            {busy === 'run' ? 'Running…' : 'Run'}
          </button>
        )}
        <button type="button" className="primary" onClick={check} disabled={!canCheck}>
          {busy === 'check' ? 'Checking…' : isCode ? 'Check tests' : 'Check answer'}
        </button>
      </div>

      {isCode && runResult && <RunOutput result={runResult} />}

      <div ref={feedbackRef}>
        {feedback && (
          <div className={`notice ${done ? 'ok' : feedback.verdict === 'partial' ? 'warn' : 'bad'}`} data-testid="feedback">
            <div className={`verdict ${feedback.verdict}`}>
              {VERDICT_LABEL[feedback.verdict]}
              {feedback.source === 'ai' && <span className="muted" style={{ fontWeight: 400 }}> · AI tutor</span>}
            </div>
            {feedback.whatWasRight && <p>{feedback.whatWasRight}</p>}
            {feedback.smallestHint && <p>{feedback.smallestHint}</p>}
            {feedback.note && <p className="muted">{feedback.note}</p>}
            {regraded && (
              <p className="muted">
                {regraded === 'typo'
                  ? 'Recorded as a typing slip. It will not count against the concept.'
                  : 'Recorded as a misreading. It will not count against the concept.'}
              </p>
            )}
          </div>
        )}
      </div>

      {wrong && !regraded && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button type="button" className="quiet" onClick={() => regrade('typo')}>
            I meant a typo
          </button>
          <button type="button" className="quiet" onClick={() => regrade('misread')}>
            {exercise.answer === 'text' ? 'I had the idea, worded differently' : 'I got the concept but misread'}
          </button>
        </div>
      )}

      {hintsShown > 0 && (
        <div className="card">
          {exercise.hints.slice(0, hintsShown).map((hint, i) => (
            <p key={i}>
              <strong>Hint {i + 1}.</strong> {hint}
            </p>
          ))}
        </div>
      )}

      {showTrace && exercise.trace && (
        <div className="card">
          <strong>Execution, step by step</strong>
          <pre className="code output" style={{ marginTop: 8 }}>{exercise.trace}</pre>
        </div>
      )}

      {wrong && !revealed && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setFeedback(null)}>
            Try again
          </button>
          {hintsShown < exercise.hints.length && (
            <button type="button" onClick={() => setHintsShown(hintsShown + 1)}>
              Small hint
            </button>
          )}
          {exercise.trace && !showTrace && (
            <button type="button" onClick={() => setShowTrace(true)}>
              Show execution
            </button>
          )}
          <button type="button" className="quiet" onClick={() => setRevealed(true)}>
            Reveal solution
          </button>
        </div>
      )}

      {(done || revealed) && (
        <div className="card" data-testid="explanation">
          {revealed && !done && (
            <>
              <strong>Solution</strong>
              {exercise.answer === 'output' && <pre className="code" style={{ marginTop: 8 }}>{exercise.expectedOutput}</pre>}
              {exercise.answer === 'choice' && <p>{exercise.choices![exercise.correctChoice!]}</p>}
              {exercise.answer === 'text' && (
                <ul>
                  {exercise.rubric!.map((r) => (
                    <li key={r.idea}>{r.idea}</li>
                  ))}
                </ul>
              )}
              {isCode && <pre className="code" style={{ marginTop: 8 }}>{exercise.solution}</pre>}
            </>
          )}
          <strong>Why</strong>
          <p>{exercise.explanation}</p>
        </div>
      )}

      {aiOn && (
        <div className="card">
          {chatOpen ? (
            <>
              <div className="row spread" style={{ marginBottom: 8 }}>
                <strong>Ask the tutor about this exercise</strong>
                <button type="button" className="quiet" style={{ minHeight: 36, padding: '4px 10px' }} onClick={() => setChatOpen(false)}>
                  Hide
                </button>
              </div>
              {!(done || revealed) && (
                <p className="muted">The tutor will help you get there but will not give the answer. Asking counts as help, like a hint.</p>
              )}
              <TutorChat
                sessionId={sessionId}
                onAsked={() => setAsked(true)}
                placeholder="For example: why is the second line False?"
                getContext={() => ({
                  exercise,
                  answer: exercise.answer === 'choice' ? (choice === null ? '' : exercise.choices![choice]) : answer,
                  lastCheck: feedback
                    ? `${VERDICT_LABEL[feedback.verdict]}. ${feedback.smallestHint ?? ''}${runResult ? ` ${evidenceOf(runResult)}` : ''}`.trim()
                    : undefined,
                  solutionSeen: done || revealed,
                })}
              />
            </>
          ) : (
            <button type="button" onClick={() => setChatOpen(true)}>
              Ask the tutor
            </button>
          )}
        </div>
      )}

      {variantState.error && <div className="notice warn">No variant was made: {variantState.error}</div>}

      <div className="row spread">
        {done || revealed ? (
          <div className="row">
            <button type="button" className="primary" onClick={next}>
              {nextLabel}
            </button>
            {aiOn && onVariant && exercise.answer === 'output' && (
              <button type="button" onClick={makeVariant} disabled={variantState.busy}>
                {variantState.busy ? 'Writing a variant…' : 'Try a variant (AI)'}
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="quiet" onClick={next}>
            Skip for now
          </button>
        )}
      </div>
    </article>
  )
}
