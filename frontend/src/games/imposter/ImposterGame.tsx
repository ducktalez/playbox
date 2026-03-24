import { useEffect, useMemo, useRef, useState } from "react";

import { PlayerNameFields } from "../../core/PlayerNameFields";
import { countEnteredPlayerNames, normalizePlayerNames } from "../../core/playerRegistration";

const API_BASE = "/api/v1/imposter";
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const TIMER_OPTIONS = [120, 300, 420, 600, 900];

const END_REASON_OPTIONS = [
  { value: "TIME_OVER", label: "Time's over" },
  { value: "SECRET_UNCOVERED", label: "Secret was uncovered" },
  { value: "FOUND_IMPOSTER", label: "Found the imposter!" },
] as const;

const IMPOSTER_FATE_OPTIONS = [
  { value: "ALIVE", label: "Alive" },
  { value: "DEAD", label: "Dead" },
] as const;

const REPORT_REASON_OPTIONS = [
  { value: "NO_REASON", label: "No reason" },
  { value: "WORD_UNKNOWN_OR_COMPLEX", label: "Word unknown or complex" },
  { value: "INAPPROPRIATE", label: "Inappropriate" },
  { value: "MISSPELLING", label: "Misspelling" },
  { value: "OTHER", label: "Other" },
] as const;

type Step = "setup" | "reveal" | "discussion" | "result";
type EndReason = (typeof END_REASON_OPTIONS)[number]["value"] | "";
type ImposterFate = (typeof IMPOSTER_FATE_OPTIONS)[number]["value"] | "";
type ReportReason = (typeof REPORT_REASON_OPTIONS)[number]["value"];

type SessionResponse = {
  id: string;
  player_names: string[];
  word: string;
  word_details: WordResponse;
  imposter_index: number;
  timer_seconds: number;
};

type RevealResponse = {
  player_name: string;
  display: string;
  error?: string;
};

type WordResponse = {
  id: string;
  text: string;
  category: string;
  source: string;
  uploaded_by: string | null;
  description: string | null;
};

type ApiError = {
  detail?: string;
  error?: string;
};

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;

  if (!response.ok) {
    throw new Error(payload.detail ?? payload.error ?? "Request failed.");
  }

  if (payload && typeof payload === "object" && "error" in payload && payload.error) {
    throw new Error(payload.error);
  }

  return payload as T;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildReportReason(reason: ReportReason, notes: string): string {
  const option = REPORT_REASON_OPTIONS.find((entry) => entry.value === reason);
  const trimmedNotes = notes.trim();

  if (!option) {
    return trimmedNotes || "No reason";
  }

  if (reason === "NO_REASON") {
    return trimmedNotes ? `No reason — ${trimmedNotes}` : "No reason";
  }

  if (reason === "OTHER") {
    return trimmedNotes ? `Other — ${trimmedNotes}` : "Other";
  }

  return trimmedNotes ? `${option.label} — ${trimmedNotes}` : option.label;
}

export default function ImposterGame() {
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<Step>("setup");
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentReveal, setCurrentReveal] = useState<RevealResponse | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isWordInfoOpen, setIsWordInfoOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("NO_REASON");
  const [reportNotes, setReportNotes] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const [endReason, setEndReason] = useState<EndReason>("");
  const [imposterFate, setImposterFate] = useState<ImposterFate>("");

  const enteredPlayerCount = useMemo(
    () => countEnteredPlayerNames(playerNames),
    [playerNames],
  );

  const resolvedCategory = session?.word_details.category ?? (selectedCategory || "Random");

  useEffect(() => {
    let ignore = false;

    async function loadCategories() {
      try {
        const response = await fetch(`${API_BASE}/categories`);
        const payload = await parseApiResponse<string[]>(response);
        if (!ignore) {
          setCategories(payload);
          setCategoriesError("");
        }
      } catch (error) {
        if (!ignore) {
          setCategoriesError(
            error instanceof Error ? error.message : "Could not load categories.",
          );
        }
      }
    }

    void loadCategories();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "discussion") {
      return undefined;
    }

    if (timeLeft <= 0) {
      setEndReason((current) => current || "TIME_OVER");
      setStep("result");
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setTimeLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [step, timeLeft]);

  useEffect(() => {
    if (!isWordInfoOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!bubbleRef.current?.contains(event.target as Node)) {
        setIsWordInfoOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsWordInfoOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isWordInfoOpen]);

  function updatePlayerName(index: number, value: string) {
    setPlayerNames((current) =>
      current.map((playerName, currentIndex) =>
        currentIndex === index ? value : playerName,
      ),
    );
  }

  function addPlayerField() {
    if (playerNames.length >= MAX_PLAYERS) {
      return;
    }

    setPlayerNames((current) => [...current, ""]);
  }

  function removePlayerField(index: number) {
    if (playerNames.length <= MIN_PLAYERS) {
      return;
    }

    setPlayerNames((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function resetRound() {
    setStep("setup");
    setSession(null);
    setCurrentPlayerIndex(0);
    setCurrentReveal(null);
    setTimeLeft(0);
    setErrorMessage("");
    setIsWordInfoOpen(false);
    setReportReason("NO_REASON");
    setReportNotes("");
    setReportMessage("");
    setEndReason("");
    setImposterFate("");
  }

  function toggleEndReason(nextReason: EndReason) {
    setEndReason((current) => {
      const updatedReason = current === nextReason ? "" : nextReason;

      if (updatedReason !== "FOUND_IMPOSTER") {
        setImposterFate("");
      }

      return updatedReason;
    });
  }

  async function startGame(nextPlayers?: string[]) {
    const sourcePlayers = nextPlayers ?? playerNames;
    const players = nextPlayers ?? normalizePlayerNames(playerNames);

    if (sourcePlayers.length < MIN_PLAYERS) {
      setErrorMessage("Please enter at least three player names.");
      return;
    }

    setIsStarting(true);
    setErrorMessage("");
    setIsWordInfoOpen(false);
    setReportReason("NO_REASON");
    setReportNotes("");
    setReportMessage("");
    setEndReason("");
    setImposterFate("");

    try {
      const response = await fetch(`${API_BASE}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          player_names: players,
          category: selectedCategory || null,
          timer_seconds: timerSeconds,
        }),
      });

      const payload = await parseApiResponse<SessionResponse>(response);
      setPlayerNames(players);
      setSession(payload);
      setCurrentPlayerIndex(0);
      setCurrentReveal(null);
      setTimeLeft(payload.timer_seconds);
      setStep("reveal");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the round.");
    } finally {
      setIsStarting(false);
    }
  }

  async function revealCurrentPlayer() {
    if (!session) {
      return;
    }

    setIsRevealing(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `${API_BASE}/session/${session.id}/reveal/${currentPlayerIndex}`,
      );
      const payload = await parseApiResponse<RevealResponse>(response);
      setCurrentReveal(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not reveal the player view.");
    } finally {
      setIsRevealing(false);
    }
  }

  function continueAfterReveal() {
    if (!session) {
      return;
    }

    if (currentPlayerIndex >= session.player_names.length - 1) {
      setCurrentReveal(null);
      setTimeLeft(session.timer_seconds);
      setStep("discussion");
      return;
    }

    setCurrentPlayerIndex((current) => current + 1);
    setCurrentReveal(null);
  }

  async function reportCurrentWord() {
    if (!session) {
      setReportMessage("Word details are not available yet.");
      return;
    }

    setIsReporting(true);
    setReportMessage("");

    try {
      const response = await fetch(`${API_BASE}/words/${session.word_details.id}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: buildReportReason(reportReason, reportNotes),
        }),
      });

      await parseApiResponse(response);
      setReportNotes("");
      setReportReason("NO_REASON");
      setReportMessage("Thanks — the word has been reported.");
    } catch (error) {
      setReportMessage(
        error instanceof Error ? error.message : "Could not submit the report.",
      );
    } finally {
      setIsReporting(false);
    }
  }

  const backToSetupButton = (
    <div className="top-action-row">
      <button
        type="button"
        className="button button--ghost back-button"
        onClick={resetRound}
      >
        ← Back to setup
      </button>
    </div>
  );

  if (step === "setup") {
    return (
      <section className="placeholder-page stack-lg">
        <p className="placeholder-kicker">Phase 1</p>
        <h1>🕵️ Imposter</h1>
        <p>
          Create a local pass-and-play round, reveal one secret view per player, and start the
          discussion timer.
        </p>

        <div className="surface-panel stack-lg">
          <PlayerNameFields
            playerNames={playerNames}
            minPlayers={MIN_PLAYERS}
            maxPlayers={MAX_PLAYERS}
            helperText={`${enteredPlayerCount} names entered manually — empty slots become Player 1, Player 2, ...`}
            onUpdatePlayerName={updatePlayerName}
            onAddPlayerField={addPlayerField}
            onRemovePlayerField={removePlayerField}
          />

          <div
            className="form-grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
          >
            <label className="field-label">
              Category
              <select
                className="select-input"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                <option value="">Random category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Discussion timer
              <select
                className="select-input"
                value={timerSeconds}
                onChange={(event) => setTimerSeconds(Number(event.target.value))}
              >
                {TIMER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatDuration(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {categoriesError && (
            <p className="helper-text">Categories are optional: {categoriesError}</p>
          )}
          {errorMessage && <p className="alert-text">{errorMessage}</p>}

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void startGame()}
              disabled={isStarting}
            >
              {isStarting ? "Creating round..." : "Create round"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!session) {
    return null;
  }

  if (step === "reveal") {
    const currentPlayerName = session.player_names[currentPlayerIndex];
    const isLastPlayer = currentPlayerIndex === session.player_names.length - 1;

    return (
      <section className="placeholder-page stack-lg">
        {backToSetupButton}
        <p className="placeholder-kicker">Pass and play</p>
        <h1>
          Player {currentPlayerIndex + 1} / {session.player_names.length}
        </h1>
        <p className="muted-text">
          Hand the device to <strong>{currentPlayerName}</strong>. Nobody else should look.
        </p>

        <div className="surface-panel stack-lg">
          <h2>{currentPlayerName}</h2>

          {!currentReveal ? (
            <>
              <p className="helper-text">Only reveal when the correct player is ready.</p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void revealCurrentPlayer()}
                  disabled={isRevealing}
                >
                  {isRevealing ? "Revealing..." : "Tap to reveal"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="reveal-display">{currentReveal.display}</div>
              <p className="muted-text">
                {currentReveal.display.includes("IMPOSTER")
                  ? "You are the Imposter. Blend in and improvise carefully."
                  : "Remember the word, then hide the screen and pass the device on."}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={continueAfterReveal}
                >
                  {isLastPlayer ? "Start discussion" : "Hide and pass on"}
                </button>
              </div>
            </>
          )}

          {errorMessage && <p className="alert-text">{errorMessage}</p>}
        </div>
      </section>
    );
  }

  if (step === "discussion") {
    return (
      <section className="placeholder-page stack-lg">
        {backToSetupButton}
        <p className="placeholder-kicker">Discussion</p>
        <h1>Discuss and find the Imposter</h1>
        <div className="surface-panel stack-lg">
          <div className={`timer-display${timeLeft <= 30 ? " alert-text" : ""}`}>
            {formatDuration(timeLeft)}
          </div>
          <div className="inline-meta">
            <span>Players: {session.player_names.length}</span>
            <span>Category: {resolvedCategory}</span>
          </div>
          <p className="muted-text">
            The secret word stays hidden until the discussion is over.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setStep("result")}
            >
              End discussion now
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="placeholder-page stack-lg">
      {backToSetupButton}
      <p className="placeholder-kicker">Round result</p>
      <h1>Reveal the answer</h1>

      <div className="surface-panel stack-lg">
        <div className="inline-meta">
          <span>Category: {resolvedCategory}</span>
          <span>Timer: {formatDuration(session.timer_seconds)}</span>
        </div>

        <div className="word-title-row">
          <div className="reveal-display">{session.word}</div>
          <div className="bubble-anchor" ref={bubbleRef}>
            <button
              type="button"
              className="icon-button"
              aria-label="Show word details"
              onClick={() => setIsWordInfoOpen((current) => !current)}
            >
              i
            </button>

            {isWordInfoOpen && (
              <div className="info-bubble stack-md">
                <div className="info-bubble__title">
                  <strong>Word info</strong>
                  <button
                    type="button"
                    className="button button--ghost back-button"
                    onClick={() => setIsWordInfoOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <ul className="info-list">
                  <li>
                    <strong>Word:</strong> {session.word}
                  </li>
                  <li>
                    <strong>Category:</strong> {resolvedCategory}
                  </li>
                  <li>
                    <strong>Uploaded by:</strong> {session.word_details.uploaded_by ?? "Unknown"}
                  </li>
                  {session.word_details.description && (
                    <li>
                      <strong>Meaning:</strong> {session.word_details.description}
                    </li>
                  )}
                </ul>

                <p className="helper-text">
                  Source: {session.word_details.source}
                </p>

                <div className="meta-block">
                  <p className="helper-text">Report this word</p>
                  <div className="choice-chips">
                    {REPORT_REASON_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`choice-chip${reportReason === option.value ? " choice-chip--selected" : ""}`}
                        onClick={() => setReportReason(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="text-area"
                    rows={3}
                    value={reportNotes}
                    placeholder="Optional note"
                    onChange={(event) => setReportNotes(event.target.value)}
                  />
                  {reportMessage && (
                    <p className={reportMessage.startsWith("Thanks") ? "helper-text" : "alert-text"}>
                      {reportMessage}
                    </p>
                  )}
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--danger"
                      onClick={() => void reportCurrentWord()}
                      disabled={isReporting}
                    >
                      {isReporting ? "Reporting..." : "Send report"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <p>
          <strong>Imposter:</strong> {session.player_names[session.imposter_index]}
        </p>

        <div className="stack-md">
          <p className="helper-text">How did the round end? (optional)</p>
          <div className="choice-chips">
            {END_REASON_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`choice-chip${endReason === option.value ? " choice-chip--selected" : ""}`}
                onClick={() => toggleEndReason(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {endReason === "FOUND_IMPOSTER" && (
            <div className="choice-chips">
              {IMPOSTER_FATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`choice-chip${imposterFate === option.value ? " choice-chip--selected" : ""}`}
                  onClick={() => setImposterFate((current) => current === option.value ? "" : option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary button--hero"
            onClick={() => void startGame(session.player_names)}
            disabled={isStarting}
          >
            {isStarting ? "Creating round..." : "Play again"}
          </button>
        </div>
      </div>
    </section>
  );
}
