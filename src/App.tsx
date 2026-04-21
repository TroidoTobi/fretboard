import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

type Mode = 'learn' | 'speed'
type NoteSet = 'natural' | 'chromatic'
type RoundStatus = 'active' | 'answered' | 'timed_out'
type Feedback = 'correct' | 'wrong' | null

type Setup = {
  mode: Mode
  noteSet: NoteSet
  fretMin: number
  fretMax: number
  enabledStrings: number[]
  timeLimitMs: number | null
  questionCount: number
  showStringLabels: boolean
}

type Round = {
  targetPitchClass: number
  targetLabel: string
  startedAt: number
  deadlineAt: number | null
  status: RoundStatus
}

type Session = {
  currentQuestion: number
  correctCount: number
  wrongCount: number
  reactionTimes: number[]
  mistakesByPitchClass: Record<number, number>
  mistakesByString: Record<number, number>
}

type CellPosition = {
  stringIndex: number
  fret: number
}

type FretCellData = CellPosition & {
  pitchClass: number
}

type UIState = {
  selectedCell: CellPosition | null
  feedback: Feedback
  revealedCorrectPositions: CellPosition[]
}

const STRING_LABELS = ['G', 'D', 'A', 'E']
const STRING_THICKNESS = [2, 2.5, 3, 3.5]
const OPEN_STRING_PITCH_CLASSES = [7, 2, 9, 4]
const CHROMATIC_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11]
const SINGLE_INLAY_FRETS = new Set([3, 5, 7, 9, 15, 17])
const DOUBLE_INLAY_FRETS = new Set([12, 24])

const DEFAULT_SETUP: Setup = {
  mode: 'learn',
  noteSet: 'natural',
  fretMin: 0,
  fretMax: 7,
  enabledStrings: [0, 1, 2, 3],
  timeLimitMs: 5000,
  questionCount: 12,
  showStringLabels: false,
}

const createEmptySession = (): Session => ({
  currentQuestion: 1,
  correctCount: 0,
  wrongCount: 0,
  reactionTimes: [],
  mistakesByPitchClass: {},
  mistakesByString: {},
})

const createInitialUI = (): UIState => ({
  selectedCell: null,
  feedback: null,
  revealedCorrectPositions: [],
})

function getPitchClass(stringIndex: number, fret: number) {
  return (OPEN_STRING_PITCH_CLASSES[stringIndex] + fret) % 12
}

function getValidPositions(targetPitchClass: number, setup: Setup) {
  const positions: FretCellData[] = []

  for (const stringIndex of setup.enabledStrings) {
    for (let fret = setup.fretMin; fret <= setup.fretMax; fret += 1) {
      const pitchClass = getPitchClass(stringIndex, fret)

      if (pitchClass === targetPitchClass) {
        positions.push({ stringIndex, fret, pitchClass })
      }
    }
  }

  return positions
}

function generateNextTarget(setup: Setup, previousPitchClass?: number) {
  const pitchClasses = setup.noteSet === 'natural' ? NATURAL_PITCH_CLASSES : CHROMATIC_LABELS.map((_, index) => index)
  const availablePitchClasses =
    previousPitchClass === undefined || pitchClasses.length === 1
      ? pitchClasses
      : pitchClasses.filter((pitchClass) => pitchClass !== previousPitchClass)
  const targetPitchClass =
    availablePitchClasses[Math.floor(Math.random() * availablePitchClasses.length)]

  return {
    targetPitchClass,
    targetLabel: CHROMATIC_LABELS[targetPitchClass],
  }
}

function evaluateAnswer(cell: FretCellData, round: Round, setup: Setup) {
  const correct = cell.pitchClass === round.targetPitchClass
  const validPositions = getValidPositions(round.targetPitchClass, setup)

  return {
    correct,
    validPositions,
    reactionTimeMs: Date.now() - round.startedAt,
  }
}

function finalizeRound(session: Session, result: { correct: boolean; reactionTimeMs: number | null }) {
  const nextSession: Session = {
    ...session,
    currentQuestion: session.currentQuestion + 1,
    correctCount: session.correctCount + (result.correct ? 1 : 0),
    reactionTimes:
      result.reactionTimeMs === null
        ? session.reactionTimes
        : [...session.reactionTimes, result.reactionTimeMs],
  }

  return {
    session: nextSession,
    wasCorrect: result.correct,
    reactionTimeMs: result.reactionTimeMs,
  }
}

function App() {
  const [screen, setScreen] = useState<'setup' | 'game' | 'results'>('setup')
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const [session, setSession] = useState<Session>(createEmptySession)
  const [round, setRound] = useState<Round | null>(null)
  const [ui, setUi] = useState<UIState>(createInitialUI)
  const [timeRemainingMs, setTimeRemainingMs] = useState<number | null>(null)
  const advanceTimeoutRef = useRef<number | null>(null)
  const sessionRef = useRef(session)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current !== null) {
        window.clearTimeout(advanceTimeoutRef.current)
      }
    }
  }, [])

  const beginRound = useCallback(
    (nextSession = session) => {
      const target = generateNextTarget(setup, round?.targetPitchClass)
      const deadlineAt = setup.mode === 'speed' && setup.timeLimitMs !== null ? Date.now() + setup.timeLimitMs : null

      setSession(nextSession)
      setUi(createInitialUI())
      setRound({
        targetPitchClass: target.targetPitchClass,
        targetLabel: target.targetLabel,
        startedAt: Date.now(),
        deadlineAt,
        status: 'active',
      })
      setTimeRemainingMs(deadlineAt === null ? null : setup.timeLimitMs)
    },
    [round?.targetPitchClass, session, setup],
  )

  const scheduleAdvance = useCallback((nextSession: Session) => {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
    }

    advanceTimeoutRef.current = window.setTimeout(() => {
      if (nextSession.currentQuestion > setup.questionCount) {
        setScreen('results')
        setRound(null)
        setTimeRemainingMs(null)
      } else {
        beginRound(nextSession)
      }
    }, 650)
  }, [beginRound, setup.questionCount])

  function startSession() {
    const nextSession = createEmptySession()
    setScreen('game')
    beginRound(nextSession)
  }

  function endSession() {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }

    setScreen('results')
    setRound(null)
    setTimeRemainingMs(null)
    setUi(createInitialUI())
  }

  function restartToSetup() {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }

    setScreen('setup')
    setSession(createEmptySession())
    setRound(null)
    setUi(createInitialUI())
    setTimeRemainingMs(null)
  }

  const handleTimeout = useCallback(() => {
    setRound((currentRound) => {
      if (currentRound === null || currentRound.status !== 'active') {
        return currentRound
      }

      const currentSession = sessionRef.current
      const revealedCorrectPositions = getValidPositions(currentRound.targetPitchClass, setup)
      const updatedSession: Session = {
        ...currentSession,
        wrongCount: currentSession.wrongCount + 1,
        mistakesByPitchClass: {
          ...currentSession.mistakesByPitchClass,
          [currentRound.targetPitchClass]:
            (currentSession.mistakesByPitchClass[currentRound.targetPitchClass] ?? 0) + 1,
        },
      }
      const finalized = finalizeRound(updatedSession, { correct: false, reactionTimeMs: null })

      setUi({
        selectedCell: null,
        feedback: 'wrong',
        revealedCorrectPositions,
      })
      setSession(finalized.session)
      scheduleAdvance(finalized.session)
      setTimeRemainingMs(0)

      return {
        ...currentRound,
        status: 'timed_out',
      }
    })
  }, [scheduleAdvance, setup])

  useEffect(() => {
    if (screen !== 'game' || round === null || round.status !== 'active' || round.deadlineAt === null) {
      return
    }

    const updateRemaining = () => {
      const remaining = Math.max(0, round.deadlineAt! - Date.now())
      setTimeRemainingMs(remaining)

      if (remaining === 0) {
        handleTimeout()
      }
    }

    updateRemaining()
    const intervalId = window.setInterval(updateRemaining, 50)

    return () => window.clearInterval(intervalId)
  }, [handleTimeout, round, screen])

  function handleCellClick(cell: FretCellData) {
    if (round === null || round.status !== 'active') {
      return
    }

    const currentSession = sessionRef.current
    const result = evaluateAnswer(cell, round, setup)
    const selectedCell = { stringIndex: cell.stringIndex, fret: cell.fret }

    if (result.correct) {
      const finalized = finalizeRound(currentSession, {
        correct: true,
        reactionTimeMs: result.reactionTimeMs,
      })

      setUi({
        selectedCell,
        feedback: 'correct',
        revealedCorrectPositions: result.validPositions,
      })
      setRound({
        ...round,
        status: 'answered',
      })
      setSession(finalized.session)
      scheduleAdvance(finalized.session)
      return
    }

    const updatedSession: Session = {
      ...currentSession,
      wrongCount: currentSession.wrongCount + 1,
      mistakesByPitchClass: {
        ...currentSession.mistakesByPitchClass,
        [round.targetPitchClass]: (currentSession.mistakesByPitchClass[round.targetPitchClass] ?? 0) + 1,
      },
      mistakesByString: {
        ...currentSession.mistakesByString,
        [cell.stringIndex]: (currentSession.mistakesByString[cell.stringIndex] ?? 0) + 1,
      },
    }

    setUi({
      selectedCell,
      feedback: 'wrong',
      revealedCorrectPositions: result.validPositions,
    })
    setSession(updatedSession)

    if (setup.mode === 'speed') {
      const finalized = finalizeRound(updatedSession, {
        correct: false,
        reactionTimeMs: result.reactionTimeMs,
      })

      setRound({
        ...round,
        status: 'answered',
      })
      setSession(finalized.session)
      scheduleAdvance(finalized.session)
    }
  }

  const totalAttempts = session.correctCount + session.wrongCount
  const accuracy = totalAttempts === 0 ? 0 : Math.round((session.correctCount / totalAttempts) * 100)
  const averageReactionTime =
    session.reactionTimes.length === 0
      ? null
      : Math.round(session.reactionTimes.reduce((sum, value) => sum + value, 0) / session.reactionTimes.length)

  return (
    <div className="app-shell">
      <div className="app-card">
        <header className="hero">
          <div>
            <p className="eyebrow">Bass Fretboard Trainer</p>
            <h1>Train note to position recall on a 4-string bass.</h1>
          </div>
          <p className="hero-copy">
            Every valid fretboard position counts. The app checks pitch class, not one fixed answer.
          </p>
        </header>

        {screen === 'setup' && (
          <SetupPanel
            setup={setup}
            onChange={setSetup}
            onStart={startSession}
          />
        )}

        {screen === 'game' && round !== null && (
          <GameScreen
            setup={setup}
            round={round}
            session={session}
            ui={ui}
            accuracy={accuracy}
            timeRemainingMs={timeRemainingMs}
            onCellClick={handleCellClick}
            onRestart={restartToSetup}
            onEnd={endSession}
          />
        )}

        {screen === 'results' && (
          <ResultsScreen
            setup={setup}
            session={session}
            accuracy={accuracy}
            averageReactionTime={averageReactionTime}
            onRestart={startSession}
            onBackToSetup={restartToSetup}
          />
        )}
      </div>
    </div>
  )
}

function SetupPanel({
  setup,
  onChange,
  onStart,
}: {
  setup: Setup
  onChange: (next: Setup) => void
  onStart: () => void
}) {
  function toggleString(stringIndex: number) {
    const enabledStrings = setup.enabledStrings.includes(stringIndex)
      ? setup.enabledStrings.filter((value) => value !== stringIndex)
      : [...setup.enabledStrings, stringIndex].sort((a, b) => a - b)

    if (enabledStrings.length > 0) {
      onChange({ ...setup, enabledStrings })
    }
  }

  return (
    <section className="panel-grid">
      <div className="panel setup-panel">
        <h2>Setup</h2>
        <div className="field-grid">
          <label>
            <span>Mode</span>
            <select
              value={setup.mode}
              onChange={(event) =>
                onChange({
                  ...setup,
                  mode: event.target.value as Mode,
                  timeLimitMs:
                    event.target.value === 'speed'
                      ? setup.timeLimitMs ?? 5000
                      : setup.timeLimitMs,
                })
              }
            >
              <option value="learn">Learn</option>
              <option value="speed">Speed</option>
            </select>
          </label>

          <label>
            <span>Note set</span>
            <select
              value={setup.noteSet}
              onChange={(event) => onChange({ ...setup, noteSet: event.target.value as NoteSet })}
            >
              <option value="natural">Natural notes</option>
              <option value="chromatic">Chromatic</option>
            </select>
          </label>

          <label>
            <span>Lowest fret</span>
            <input
              type="number"
              min={0}
              max={setup.fretMax}
              value={setup.fretMin}
              onChange={(event) =>
                onChange({
                  ...setup,
                  fretMin: Math.max(0, Math.min(Number(event.target.value), setup.fretMax)),
                })
              }
            />
          </label>

          <label>
            <span>Highest fret</span>
            <input
              type="number"
              min={setup.fretMin}
              max={18}
              value={setup.fretMax}
              onChange={(event) =>
                onChange({
                  ...setup,
                  fretMax: Math.max(setup.fretMin, Math.min(Number(event.target.value), 18)),
                })
              }
            />
          </label>

          <label>
            <span>Questions</span>
            <input
              type="number"
              min={1}
              max={100}
              value={setup.questionCount}
              onChange={(event) =>
                onChange({
                  ...setup,
                  questionCount: Math.max(1, Math.min(Number(event.target.value), 100)),
                })
              }
            />
          </label>

          <label>
            <span>Time limit</span>
            <select
              value={setup.timeLimitMs === null ? 'none' : String(setup.timeLimitMs)}
              onChange={(event) =>
                onChange({
                  ...setup,
                  timeLimitMs: event.target.value === 'none' ? null : Number(event.target.value),
                })
              }
            >
              <option value="none">No timer</option>
              <option value="3000">3 seconds</option>
              <option value="5000">5 seconds</option>
              <option value="8000">8 seconds</option>
              <option value="12000">12 seconds</option>
            </select>
          </label>
        </div>

        <div className="string-picker">
          <span>Enabled strings</span>
          <div className="chip-row">
            {STRING_LABELS.map((label, stringIndex) => (
              <button
                key={label}
                type="button"
                className={setup.enabledStrings.includes(stringIndex) ? 'chip active' : 'chip'}
                onClick={() => toggleString(stringIndex)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="toggle-row">
          <span>Show string labels</span>
          <input
            type="checkbox"
            checked={setup.showStringLabels}
            onChange={(event) => onChange({ ...setup, showStringLabels: event.target.checked })}
          />
        </label>

        <button type="button" className="primary-button" onClick={onStart}>
          Start Session
        </button>
      </div>

      <aside className="panel info-panel">
        <h2>How it works</h2>
        <ul>
          <li>Target notes are shown as pitch classes with note labels.</li>
          <li>Any matching position on the enabled strings and fret range is correct.</li>
          <li>Learn mode lets the player retry the same note after mistakes.</li>
          <li>Speed mode gives one attempt per question and can enforce a timer.</li>
        </ul>
      </aside>
    </section>
  )
}

function GameScreen({
  setup,
  round,
  session,
  ui,
  accuracy,
  timeRemainingMs,
  onCellClick,
  onRestart,
  onEnd,
}: {
  setup: Setup
  round: Round
  session: Session
  ui: UIState
  accuracy: number
  timeRemainingMs: number | null
  onCellClick: (cell: FretCellData) => void
  onRestart: () => void
  onEnd: () => void
}) {
  return (
    <section className="game-layout">
      <div className="game-topbar">
        <div className="panel prompt-panel">
          <div className="progress-row">
            <span>
              Question {Math.min(session.currentQuestion, setup.questionCount)} / {setup.questionCount}
            </span>
            <span>{setup.mode === 'learn' ? 'Learn Mode' : 'Speed Mode'}</span>
          </div>
          <div className="prompt-note">{round.targetLabel}</div>
          <p className="prompt-copy">Tap any correct location for this note on the fretboard.</p>
          {setup.timeLimitMs !== null && timeRemainingMs !== null && (
            <TimerBar remainingMs={timeRemainingMs} totalMs={setup.timeLimitMs} />
          )}
        </div>

        <div className="panel mini-stats">
          <div>
            <span className="stat-label">Correct</span>
            <strong>{session.correctCount}</strong>
          </div>
          <div>
            <span className="stat-label">Wrong</span>
            <strong>{session.wrongCount}</strong>
          </div>
          <div>
            <span className="stat-label">Accuracy</span>
            <strong>{accuracy}%</strong>
          </div>
        </div>
      </div>

      <Fretboard setup={setup} ui={ui} onCellClick={onCellClick} />

      <div className="panel control-bar">
        <span>
          {ui.feedback === 'correct' && 'Correct. Every matching position counts.'}
          {ui.feedback === 'wrong' &&
            (setup.mode === 'learn'
              ? 'Incorrect. The highlighted cells show all valid answers. Try again.'
              : 'Incorrect. The highlighted cells show all valid answers.')}
          {ui.feedback === null && 'Use the control buttons if you want to restart or end early.'}
        </span>
        <div className="control-actions">
          <button type="button" onClick={onRestart}>
            Restart
          </button>
          <button type="button" onClick={onEnd}>
            End Session
          </button>
        </div>
      </div>
    </section>
  )
}

function TimerBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }) {
  const percentage = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100))

  return (
    <div className="timer-wrap" aria-label="Time remaining">
      <div className="timer-bar">
        <div className="timer-fill" style={{ width: `${percentage}%` }} />
      </div>
      <span>{(remainingMs / 1000).toFixed(1)}s</span>
    </div>
  )
}

function Fretboard({
  setup,
  ui,
  onCellClick,
}: {
  setup: Setup
  ui: UIState
  onCellClick: (cell: FretCellData) => void
}) {
  const frets: number[] = []
  for (let fret = setup.fretMin; fret <= setup.fretMax; fret += 1) {
    frets.push(fret)
  }

  return (
    <div className="panel fretboard-panel">
      <div className="fretboard-hint">Swipe horizontally if the full neck does not fit on screen.</div>
      <div className="fretboard-scroll">
        <div
          className="fretboard-grid"
          style={{
            gridTemplateColumns: `${setup.showStringLabels ? 72 : 28}px repeat(${frets.length}, minmax(64px, 1fr))`,
          }}
        >
          <div className="corner-cell" />
          {frets.map((fret) => (
            <div key={fret} className="fret-label">
              {fret}
            </div>
          ))}

          {STRING_LABELS.map((stringLabel, stringIndex) => (
            <StringRow
              key={stringLabel}
              stringIndex={stringIndex}
              stringLabel={stringLabel}
              frets={frets}
              enabled={setup.enabledStrings.includes(stringIndex)}
              showLabel={setup.showStringLabels}
              ui={ui}
              onCellClick={onCellClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StringRow({
  stringIndex,
  stringLabel,
  frets,
  enabled,
  showLabel,
  ui,
  onCellClick,
}: {
  stringIndex: number
  stringLabel: string
  frets: number[]
  enabled: boolean
  showLabel: boolean
  ui: UIState
  onCellClick: (cell: FretCellData) => void
}) {
  return (
    <>
      <div className={enabled ? 'string-label' : 'string-label disabled'}>{showLabel ? stringLabel : ''}</div>
      {frets.map((fret) => {
        const pitchClass = getPitchClass(stringIndex, fret)
        const isSelected =
          ui.selectedCell?.stringIndex === stringIndex && ui.selectedCell?.fret === fret
        const isRevealed = ui.revealedCorrectPositions.some(
          (position) => position.stringIndex === stringIndex && position.fret === fret,
        )
        const showSingleInlay = SINGLE_INLAY_FRETS.has(fret) && stringIndex === 1
        const showDoubleInlayTop = DOUBLE_INLAY_FRETS.has(fret) && stringIndex === 1
        const showDoubleInlayBottom = DOUBLE_INLAY_FRETS.has(fret) && stringIndex === 2
        const isNut = fret === 0

        let visualState = 'neutral'
        if (!enabled) {
          visualState = 'disabled'
        } else if (isSelected && ui.feedback === 'correct') {
          visualState = 'correct'
        } else if (isSelected && ui.feedback === 'wrong') {
          visualState = 'wrong'
        } else if (isRevealed) {
          visualState = 'hint'
        }

        return (
          <button
            key={`${stringIndex}-${fret}`}
            type="button"
            className={`fret-cell ${visualState} ${isNut ? 'nut' : ''}`}
            disabled={!enabled}
            onClick={() => onCellClick({ stringIndex, fret, pitchClass })}
            aria-label={`${stringLabel} string fret ${fret}`}
          >
            <span
              className="string-line"
              style={{ height: `${STRING_THICKNESS[stringIndex]}px` }}
              aria-hidden="true"
            />
            {showSingleInlay && <span className="inlay-dot" aria-hidden="true" />}
            {showDoubleInlayTop && <span className="inlay-dot double-top" aria-hidden="true" />}
            {showDoubleInlayBottom && <span className="inlay-dot double-bottom" aria-hidden="true" />}
          </button>
        )
      })}
    </>
  )
}

function ResultsScreen({
  setup,
  session,
  accuracy,
  averageReactionTime,
  onRestart,
  onBackToSetup,
}: {
  setup: Setup
  session: Session
  accuracy: number
  averageReactionTime: number | null
  onRestart: () => void
  onBackToSetup: () => void
}) {
  const mistakeEntries = Object.entries(session.mistakesByPitchClass)
    .sort((first, second) => Number(first[0]) - Number(second[0]))
    .map(([pitchClass, count]) => `${CHROMATIC_LABELS[Number(pitchClass)]}: ${count}`)

  return (
    <section className="results-layout">
      <div className="panel results-hero">
        <p className="eyebrow">Session complete</p>
        <h2>
          {session.correctCount} correct out of {setup.questionCount} prompts
        </h2>
        <div className="results-stats">
          <div>
            <span className="stat-label">Accuracy</span>
            <strong>{accuracy}%</strong>
          </div>
          <div>
            <span className="stat-label">Average reaction</span>
            <strong>{averageReactionTime === null ? 'n/a' : `${averageReactionTime} ms`}</strong>
          </div>
          <div>
            <span className="stat-label">Wrong attempts</span>
            <strong>{session.wrongCount}</strong>
          </div>
        </div>
      </div>

      <div className="panel results-detail">
        <h3>Mistakes by note</h3>
        {mistakeEntries.length === 0 ? (
          <p>No mistakes recorded.</p>
        ) : (
          <div className="mistake-grid">
            {mistakeEntries.map((entry) => (
              <span key={entry} className="mistake-pill">
                {entry}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="results-actions">
        <button type="button" className="primary-button" onClick={onRestart}>
          Play Again
        </button>
        <button type="button" onClick={onBackToSetup}>
          Change Setup
        </button>
      </div>
    </section>
  )
}

export default App
