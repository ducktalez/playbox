import { useEffect, useRef, useState } from "react";

import { PlayerNameFields } from "../../core/PlayerNameFields";
import { normalizePlayerNames } from "../../core/playerRegistration";
import {
  createOfflineSession,
  createOfflineSessionAsync,
  nextOfflineChallenge,
  type OfflineSession,
} from "./offlineSession";
import { getOfflinePiccoloCategories, syncPiccolo } from "../../core/offlineManager";

const API_BASE = "/api/v1/piccolo";
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 20;
const INTENSITY_OPTIONS = [
  { value: "mild", label: "Mild", description: "Thinker version without drinking pressure." },
  { value: "medium", label: "Medium", description: "Classic drinking-game mode for regular rounds." },
  { value: "spicy", label: "Spicy", description: "Wildcard mode for louder and wilder parties." },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  dare: "Dare",
  question: "Question",
  group: "Group",
  vote: "Vote",
  versus: "Versus",
  automarken: "Automarken",
  "koffer packen": "Koffer packen",
  "ich habe schon mal": "Ich habe schon mal",
  trinkregeln: "Trinkregeln",
};

const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  dare: "piccolo-card--dare",
  question: "piccolo-card--question",
  group: "piccolo-card--group",
  vote: "piccolo-card--vote",
  versus: "piccolo-card--versus",
  automarken: "piccolo-card--automarken",
  "koffer packen": "piccolo-card--koffer-packen",
  "ich habe schon mal": "piccolo-card--ich-habe-schon-mal",
  trinkregeln: "piccolo-card--trinkregeln",
};

type SessionResponse = {
  id: string;
  player_names: string[];
  intensity: string;
  total_challenges: number;
};

type ChallengeResponse = {
  text: string;
  category: string;
  intensity: string;
  targets: string[];
};


export default function PiccoloGame() {
  const [playerNames, setPlayerNames] = useState<string[]>(["", ""]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [intensity, setIntensity] = useState<(typeof INTENSITY_OPTIONS)[number]["value"]>("medium");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(false);
  const [slideKey, setSlideKey] = useState(0);
  const offlineSessionRef = useRef<OfflineSession | null>(null);

  // Challenge report state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<string | null>(null);
  const [reportComment, setReportComment] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [reportSending, setReportSending] = useState(false);

  const selectedIntensity = INTENSITY_OPTIONS.find((option) => option.value === intensity);

  useEffect(() => {
    let ignore = false;

    // ── Cache-first: load categories from IndexedDB immediately ──
    async function loadCachedCategories() {
      try {
        const offlineCats = await getOfflinePiccoloCategories();
        if (!ignore && offlineCats.length > 0) {
          setCategories(offlineCats);
          setCategoriesError("");
        }
      } catch { /* ignore */ }
    }

    // ── Background sync: refresh data from server when online ──
    async function syncFromServer() {
      try {
        await syncPiccolo();
        // After sync, reload categories from the now-updated IndexedDB
        const freshCats = await getOfflinePiccoloCategories();
        if (!ignore && freshCats.length > 0) {
          setCategories(freshCats);
          setCategoriesError("");
        }
      } catch {
        // Server unreachable — cached data stays valid
      }
    }

    void loadCachedCategories();
    void syncFromServer();

    return () => {
      ignore = true;
    };
  }, []);

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

  function toggleCategory(category: string) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((entry) => entry !== category)
        : [...current, category],
    );
  }

  function resetGame() {
    setSession(null);
    setCurrentChallenge(null);
    setErrorMessage("");
    setReportOpen(false);
    setReportCategory(null);
    setReportComment("");
    setReportSent(false);
  }

  function resetReportState() {
    setReportOpen(false);
    setReportCategory(null);
    setReportComment("");
    setReportSent(false);
  }

  async function submitReport() {
    if (!currentChallenge || !reportCategory) return;
    setReportSending(true);
    try {
      await fetch(`${API_BASE}/challenges/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_text: currentChallenge.text,
          feedback_type: "REPORT",
          category: reportCategory,
          comment: reportComment || null,
        }),
      });
      setReportSent(true);
    } catch {
      // Offline — silently ignore
      setReportSent(true);
    } finally {
      setReportSending(false);
    }
  }

  function loadNextChallenge() {
    setIsLoadingChallenge(true);
    setErrorMessage("");
    resetReportState();

    // ── Offline-first: always compute challenge locally ──
    if (offlineSessionRef.current) {
      const result = nextOfflineChallenge(offlineSessionRef.current);
      if (result) {
        setCurrentChallenge(result);
        setSlideKey((k) => k + 1);
      } else {
        setErrorMessage("Keine Challenges mehr verfügbar.");
      }
    } else {
      setErrorMessage("Keine Session vorhanden.");
    }
    setIsLoadingChallenge(false);
  }

  async function startGame() {
    const players = normalizePlayerNames(playerNames);

    if (players.length < MIN_PLAYERS) {
      setErrorMessage("Please enter at least two player names.");
      return;
    }

    setIsStarting(true);
    setErrorMessage("");
    setCurrentChallenge(null);
    offlineSessionRef.current = null;

    // ── Offline-first: always create session locally from cached challenges ──
    const cats = selectedCategories.length > 0 ? selectedCategories : null;

    let offSession = createOfflineSession(players, intensity, cats);
    if (!offSession) {
      offSession = await createOfflineSessionAsync(players, intensity, cats);
    }

    if (offSession) {
      offlineSessionRef.current = offSession;
      setPlayerNames(players);
      setSession({
        id: offSession.id,
        player_names: offSession.player_names,
        intensity: offSession.intensity,
        total_challenges: offSession.total_challenges,
      });

      // Load first challenge locally
      const first = nextOfflineChallenge(offSession);
      if (first) {
        setCurrentChallenge(first);
        setSlideKey((k) => k + 1);
      }
    } else {
      setSession(null);
      setErrorMessage(
        "Keine gecachten Challenges vorhanden. Bitte einmal online laden, um Challenges zu cachen.",
      );
    }

    setIsStarting(false);
  }

  if (!session) {
    return (
      <section className="placeholder-page stack-lg">
        <p className="placeholder-kicker">Phase 2</p>
        <h1>🎉 Piccolo</h1>
        <p>Build a local party round with players, category filters and the next challenge flow.</p>

        <div className="surface-panel stack-lg">
          <PlayerNameFields
            playerNames={playerNames}
            minPlayers={MIN_PLAYERS}
            maxPlayers={MAX_PLAYERS}
            helperText="Empty names automatically become Player 1, Player 2, ... for faster testing."
            onUpdatePlayerName={updatePlayerName}
            onAddPlayerField={addPlayerField}
            onRemovePlayerField={removePlayerField}
          />

          <div className="stack-md">
            <div>
              <p className="helper-text">Intensity</p>
              <div className="choice-chips">
                {INTENSITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`choice-chip${intensity === option.value ? " choice-chip--selected" : ""}`}
                    onClick={() => setIntensity(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {selectedIntensity && (
                <p className="helper-text" style={{ marginTop: "0.6rem" }}>
                  {selectedIntensity.description}
                </p>
              )}
            </div>

            <div>
              <p className="helper-text">Categories (optional)</p>
              {categories.length > 0 ? (
                <div className="choice-chips">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className={`choice-chip${selectedCategories.includes(category) ? " choice-chip--selected" : ""}`}
                      onClick={() => toggleCategory(category)}
                    >
                      {CATEGORY_LABELS[category] ?? category}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="helper-text">{categoriesError || "Loading categories..."}</p>
              )}
            </div>
          </div>

          {errorMessage && <p className="alert-text">{errorMessage}</p>}

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => void startGame()}
              disabled={isStarting}
            >
              {isStarting ? "Creating round..." : "Start Piccolo"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="piccolo-fullscreen" aria-label="Piccolo fullscreen challenge view">
      <button
        type="button"
        className="button button--ghost piccolo-fullscreen__exit"
        onClick={resetGame}
      >
        ←
      </button>

      {/* Report button — top right */}
      {currentChallenge && (
        <button
          type="button"
          className="button button--ghost piccolo-fullscreen__report"
          onClick={(e) => { e.stopPropagation(); setReportOpen(!reportOpen); setReportSent(false); }}
          title="Challenge melden"
          style={{ position: "absolute", top: "0.75rem", right: "0.75rem", zIndex: 20, fontSize: "1.2rem", opacity: 0.7 }}
        >
          🚩
        </button>
      )}

      {/* Report sheet */}
      {reportOpen && currentChallenge && (
        <div
          className="piccolo-report-sheet"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30,
            background: "rgba(30,30,40,0.97)", padding: "1rem 1.2rem 1.5rem",
            borderRadius: "1rem 1rem 0 0", maxHeight: "60vh", overflowY: "auto",
          }}
        >
          {reportSent ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <p style={{ fontSize: "1.1rem" }}>✅ Danke für dein Feedback!</p>
              <button
                type="button"
                className="button button--ghost"
                onClick={resetReportState}
                style={{ marginTop: "0.75rem" }}
              >
                Schließen
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>🚩 Challenge melden</p>
              <div className="choice-chips" style={{ marginBottom: "0.75rem" }}>
                {(["INAPPROPRIATE", "BORING", "BROKEN_TEMPLATE", "OTHER"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`choice-chip${reportCategory === cat ? " choice-chip--selected" : ""}`}
                    onClick={() => setReportCategory(reportCategory === cat ? null : cat)}
                  >
                    {cat === "INAPPROPRIATE" ? "Unangemessen" :
                     cat === "BORING" ? "Langweilig" :
                     cat === "BROKEN_TEMPLATE" ? "Kaputt" : "Anderes"}
                  </button>
                ))}
              </div>
              <textarea
                className="text-input"
                placeholder="Kommentar (optional)"
                value={reportComment}
                onChange={(e) => setReportComment(e.target.value)}
                rows={2}
                maxLength={500}
                style={{ width: "100%", marginBottom: "0.75rem", resize: "none" }}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!reportCategory || reportSending}
                  onClick={() => void submitReport()}
                  style={{ flex: 1 }}
                >
                  {reportSending ? "Sende..." : "Absenden"}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={resetReportState}
                >
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className={`piccolo-fullscreen__surface ${currentChallenge ? CATEGORY_COLOR_CLASSES[currentChallenge.category] ?? "piccolo-card--default" : "piccolo-card--default"}`}
        onClick={() => {
          if (!isLoadingChallenge) {
            loadNextChallenge();
          }
        }}
        disabled={isLoadingChallenge}
      >
        <div className="piccolo-fullscreen__content stack-lg">
          <p className="placeholder-kicker">Piccolo round</p>

          <div className="inline-meta">
            <span>Players: {session.player_names.length}</span>
            <span>Intensity: {selectedIntensity?.label ?? session.intensity}</span>
            <span>Available challenges: {session.total_challenges}</span>
          </div>

          {selectedIntensity && <p className="helper-text">{selectedIntensity.description}</p>}

          {currentChallenge ? (
            <div key={slideKey} className="piccolo-challenge-slide">
              <div className="choice-chips">
                <span className="choice-chip choice-chip--selected">
                  {CATEGORY_LABELS[currentChallenge.category] ?? currentChallenge.category}
                </span>
                <span className="choice-chip">{currentChallenge.intensity}</span>
              </div>

              <div className="piccolo-fullscreen__challenge reveal-display">{currentChallenge.text}</div>

              {currentChallenge.targets.length > 0 && (
                <p className="muted-text">Targets: {currentChallenge.targets.join(", ")}</p>
              )}

              <p className="helper-text piccolo-card__hint">
                {isLoadingChallenge ? "Loading next challenge..." : "Tap anywhere for the next challenge"}
              </p>
            </div>
          ) : (
            <p className="helper-text">No challenge loaded yet.</p>
          )}

          {errorMessage && <p className="alert-text">{errorMessage}</p>}
        </div>
      </button>
    </section>
  );
}
