import { useEffect, useMemo, useState } from "react";

const API_BASE = "/api/v1/imposter";
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const TIMER_OPTIONS = [120, 300, 420, 600, 900];

type Step = "setup" | "reveal" | "discussion" | "result";

type SessionResponse = {
  id: string;
  player_names: string[];
  word: string;
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

export default function ImposterGame() {
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
  const [reportReason, setReportReason] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [isReporting, setIsReporting] = useState(false);

  const normalizedPlayers = useMemo(
    () => playerNames.map((player) => player.trim()).filter(Boolean),
    [playerNames],
  );

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
    setReportReason("");
    setReportMessage("");
  }

  async function startGame(nextPlayers?: string[]) {
    const players = (nextPlayers ?? playerNames).map((player) => player.trim()).filter(Boolean);

    if (players.length < MIN_PLAYERS) {
      setErrorMessage("Please enter at least three player names.");
      return;
    }

    setIsStarting(true);
    setErrorMessage("");
    setReportMessage("");
    setReportReason("");

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
      return;
    }

    setIsReporting(true);
    setReportMessage("");

    try {
      const wordsUrl = selectedCategory
        ? `${API_BASE}/words?category=${encodeURIComponent(selectedCategory)}`
        : `${API_BASE}/words`;

      const wordsResponse = await fetch(wordsUrl);
      const words = await parseApiResponse<WordResponse[]>(wordsResponse);
      const matchedWord = words.find((word) => word.text === session.word);

      if (!matchedWord) {
        throw new Error("Could not resolve the current word for reporting.");
      }

      const reportResponse = await fetch(`${API_BASE}/words/${matchedWord.id}/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: reportReason.trim(),
        }),
      });

      await parseApiResponse(reportResponse);
      setReportReason("");
      setReportMessage("Thanks — the word has been reported.");
    } catch (error) {
      setReportMessage(
        error instanceof Error ? error.message : "Could not submit the report.",
      );
    } finally {
      setIsReporting(false);
    }
  }

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
          <div className="stack-md">
            {playerNames.map((playerName, index) => (
              <div key={`${index}-${playerName}`} className="player-row">
                <input
                  className="text-input"
                  type="text"
                  value={playerName}
                  placeholder={`Player ${index + 1}`}
                  onChange={(event) => updatePlayerName(index, event.target.value)}
                />
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => removePlayerField(index)}
                  disabled={playerNames.length <= MIN_PLAYERS}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={addPlayerField}
              disabled={playerNames.length >= MAX_PLAYERS}
            >
              Add player
            </button>
            <span className="helper-text">
              {normalizedPlayers.length} / {MAX_PLAYERS} players ready
            </span>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
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

          {categoriesError && <p className="helper-text">Categories are optional: {categoriesError}</p>}
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
        <p className="placeholder-kicker">Discussion</p>
        <h1>Discuss and find the Imposter</h1>
        <div className="surface-panel stack-lg">
          <div className={`timer-display${timeLeft <= 30 ? " alert-text" : ""}`}>
            {formatDuration(timeLeft)}
          </div>
          <div className="inline-meta">
            <span>Players: {session.player_names.length}</span>
            <span>Category: {selectedCategory || "Random"}</span>
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
      <p className="placeholder-kicker">Round result</p>
      <h1>Reveal the answer</h1>

      <div className="surface-panel stack-lg">
        <div className="inline-meta">
          <span>Category: {selectedCategory || "Random"}</span>
          <span>Timer: {formatDuration(session.timer_seconds)}</span>
        </div>
        <div className="reveal-display">{session.word}</div>
        <p>
          <strong>Imposter:</strong> {session.player_names[session.imposter_index]}
        </p>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void startGame(session.player_names)}
            disabled={isStarting}
          >
            {isStarting ? "Creating round..." : "Play again"}
          </button>
          <button type="button" className="button button--secondary" onClick={resetRound}>
            Back to setup
          </button>
        </div>
      </div>

      <div className="surface-panel stack-md">
        <h2>Report this word</h2>
        <p className="helper-text">
          Send a short note if the selected word is inappropriate or broken.
        </p>
        <textarea
          className="text-area"
          rows={4}
          value={reportReason}
          placeholder="Optional reason"
          onChange={(event) => setReportReason(event.target.value)}
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
            {isReporting ? "Reporting..." : "Report word"}
          </button>
        </div>
      </div>
    </section>
  );
}
