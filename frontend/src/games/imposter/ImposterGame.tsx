import { useEffect, useMemo, useRef, useState } from "react";

import { PlayerNameFields } from "../../core/PlayerNameFields";
import { countEnteredPlayerNames, normalizePlayerNames } from "../../core/playerRegistration";
import { parseApiResponse } from "../../core/api";
import { createOfflineSession, createOfflineSessionAsync, revealOffline } from "./offlineSession";
import { getOfflineImposterCategories, syncImposter } from "../../core/offlineManager";
import { useTranslation, mergeTranslations } from "../../core/i18n";
import { coreTranslations } from "../../core/translations";
import { imposterTranslations } from "./translations";

const translations = mergeTranslations(coreTranslations, imposterTranslations);

const API_BASE = "/api/v1/imposter";
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const TIMER_OPTIONS = [120, 300, 420, 600, 900];

const END_REASON_OPTIONS = [
  { value: "TIME_OVER", labelKey: "endReason.timeOver" },
  { value: "SECRET_UNCOVERED", labelKey: "endReason.secretUncovered" },
  { value: "FOUND_IMPOSTER", labelKey: "endReason.foundImposter" },
] as const;

const IMPOSTER_FATE_OPTIONS = [
  { value: "ALIVE", labelKey: "fate.alive" },
  { value: "DEAD", labelKey: "fate.dead" },
] as const;

const REPORT_REASON_OPTIONS = [
  { value: "NO_REASON", labelKey: "report.noReason" },
  { value: "WORD_UNKNOWN_OR_COMPLEX", labelKey: "report.wordUnknown" },
  { value: "INAPPROPRIATE", labelKey: "report.inappropriate" },
  { value: "MISSPELLING", labelKey: "report.misspelling" },
  { value: "OTHER", labelKey: "report.other" },
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


function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function triggerTimerAlarm() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.55);
    gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.7);
    osc.stop(ctx.currentTime + 1);
    setTimeout(() => ctx.close(), 1200);
  } catch { /* Audio not available */ }
}

function buildReportReason(reason: ReportReason, notes: string): string {
  const trimmedNotes = notes.trim();
  if (reason === "NO_REASON") return trimmedNotes ? `NO_REASON — ${trimmedNotes}` : "NO_REASON";
  if (reason === "OTHER") return trimmedNotes ? `OTHER — ${trimmedNotes}` : "OTHER";
  return trimmedNotes ? `${reason} — ${trimmedNotes}` : reason;
}

export default function ImposterGame() {
  const { t } = useTranslation(translations);
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
  const [roundCount, setRoundCount] = useState(0);

  const enteredPlayerCount = useMemo(() => countEnteredPlayerNames(playerNames), [playerNames]);
  const resolvedCategory = session?.word_details.category ?? (selectedCategory || "Random");

  useEffect(() => {
    let ignore = false;
    async function loadCachedCategories() {
      try {
        const offlineCats = await getOfflineImposterCategories();
        if (!ignore && offlineCats.length > 0) { setCategories(offlineCats); setCategoriesError(""); }
      } catch { /* ignore */ }
    }
    async function syncFromServer() {
      try {
        await syncImposter();
        const freshCats = await getOfflineImposterCategories();
        if (!ignore && freshCats.length > 0) { setCategories(freshCats); setCategoriesError(""); }
      } catch { /* Server unreachable */ }
    }
    void loadCachedCategories();
    void syncFromServer();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (step !== "discussion") return undefined;
    if (timeLeft <= 0) { triggerTimerAlarm(); setEndReason((c) => c || "TIME_OVER"); setStep("result"); return undefined; }
    const timerId = window.setInterval(() => setTimeLeft((c) => Math.max(c - 1, 0)), 1000);
    return () => { window.clearInterval(timerId); };
  }, [step, timeLeft]);

  useEffect(() => {
    if (!isWordInfoOpen) return undefined;
    function handlePointerDown(e: MouseEvent) { if (!bubbleRef.current?.contains(e.target as Node)) setIsWordInfoOpen(false); }
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") setIsWordInfoOpen(false); }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousedown", handlePointerDown); document.removeEventListener("keydown", handleKeyDown); };
  }, [isWordInfoOpen]);

  function updatePlayerName(index: number, value: string) { setPlayerNames((c) => c.map((pn, i) => (i === index ? value : pn))); }
  function addPlayerField() { if (playerNames.length < MAX_PLAYERS) setPlayerNames((c) => [...c, ""]); }
  function removePlayerField(index: number) { if (playerNames.length > MIN_PLAYERS) setPlayerNames((c) => c.filter((_, i) => i !== index)); }

  function resetRound() {
    setStep("setup"); setSession(null); setCurrentPlayerIndex(0); setCurrentReveal(null);
    setTimeLeft(0); setErrorMessage(""); setIsWordInfoOpen(false);
    setReportReason("NO_REASON"); setReportNotes(""); setReportMessage("");
    setEndReason(""); setImposterFate("");
  }

  function toggleEndReason(nextReason: EndReason) {
    setEndReason((c) => { const r = c === nextReason ? "" : nextReason; if (r !== "FOUND_IMPOSTER") setImposterFate(""); return r; });
  }

  async function startGame(nextPlayers?: string[]) {
    const sourcePlayers = nextPlayers ?? playerNames;
    const players = nextPlayers ?? normalizePlayerNames(playerNames, t("player.fallbackPrefix"));
    if (sourcePlayers.length < MIN_PLAYERS) { setErrorMessage(t("setup.errorMinPlayers")); return; }
    setIsStarting(true); setErrorMessage(""); setIsWordInfoOpen(false);
    setReportReason("NO_REASON"); setReportNotes(""); setReportMessage(""); setEndReason(""); setImposterFate("");

    let offlineSession = createOfflineSession(players, selectedCategory || null, timerSeconds);
    if (!offlineSession) offlineSession = await createOfflineSessionAsync(players, selectedCategory || null, timerSeconds);

    if (offlineSession) {
      setPlayerNames(players); setSession(offlineSession as SessionResponse);
      setCurrentPlayerIndex(0); setCurrentReveal(null); setTimeLeft(offlineSession.timer_seconds);
      setRoundCount((c) => c + 1); setStep("reveal");
    } else {
      setErrorMessage(t("setup.errorNoCache"));
    }
    setIsStarting(false);
  }

  async function revealCurrentPlayer() {
    if (!session) return;
    setIsRevealing(true); setErrorMessage("");
    setCurrentReveal(revealOffline(session as Parameters<typeof revealOffline>[0], currentPlayerIndex));
    setIsRevealing(false);
  }

  function continueAfterReveal() {
    if (!session) return;
    if (currentPlayerIndex >= session.player_names.length - 1) { setCurrentReveal(null); setTimeLeft(session.timer_seconds); setStep("discussion"); return; }
    setCurrentPlayerIndex((c) => c + 1); setCurrentReveal(null);
  }

  async function reportCurrentWord() {
    if (!session) { setReportMessage(t("result.wordNotAvailable")); return; }
    setIsReporting(true); setReportMessage("");
    try {
      const response = await fetch(`${API_BASE}/words/${session.word_details.id}/report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: buildReportReason(reportReason, reportNotes) }),
      });
      await parseApiResponse(response);
      setReportNotes(""); setReportReason("NO_REASON"); setReportMessage(t("result.reportSuccess"));
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : t("result.reportError"));
    } finally { setIsReporting(false); }
  }

  const backToSetupButton = (
    <div className="top-action-row">
      <button type="button" className="button button--ghost back-button" onClick={resetRound}>{t("backToSetup")}</button>
    </div>
  );

  // ──── SETUP ────
  if (step === "setup") {
    return (
      <section className="placeholder-page stack-lg">
        <p className="placeholder-kicker">{t("setup.kicker")}</p>
        <h1>{t("setup.title")}</h1>
        <p>{t("setup.description")}</p>
        <div className="surface-panel stack-lg">
          <PlayerNameFields playerNames={playerNames} minPlayers={MIN_PLAYERS} maxPlayers={MAX_PLAYERS}
            helperText={t("setup.helperText", { count: enteredPlayerCount })}
            onUpdatePlayerName={updatePlayerName} onAddPlayerField={addPlayerField} onRemovePlayerField={removePlayerField} />
          <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label className="field-label">
              {t("setup.category")}
              <select className="select-input" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                <option value="">{t("setup.randomCategory")}</option>
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <label className="field-label">
              {t("setup.timer")}
              <select className="select-input" value={timerSeconds} onChange={(e) => setTimerSeconds(Number(e.target.value))}>
                {TIMER_OPTIONS.map((opt) => <option key={opt} value={opt}>{formatDuration(opt)}</option>)}
              </select>
            </label>
          </div>
          {categoriesError && <p className="helper-text">{t("setup.categoriesOptional", { error: categoriesError })}</p>}
          {errorMessage && <p className="alert-text">{errorMessage}</p>}
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={() => void startGame()} disabled={isStarting}>
              {isStarting ? t("setup.creating") : t("setup.create")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!session) return null;

  // ──── REVEAL ────
  if (step === "reveal") {
    const currentPlayerName = session.player_names[currentPlayerIndex];
    const isLastPlayer = currentPlayerIndex === session.player_names.length - 1;
    return (
      <section className="placeholder-page stack-lg">
        {backToSetupButton}
        <p className="placeholder-kicker">{t("reveal.kicker")}</p>
        <h1>{t("reveal.playerOf", { n: currentPlayerIndex + 1, total: session.player_names.length })}</h1>
        <p className="muted-text">{t("reveal.handDevice", { name: currentPlayerName })}</p>
        <div className="surface-panel stack-lg">
          <h2>{currentPlayerName}</h2>
          {!currentReveal ? (
            <>
              <p className="helper-text">{t("reveal.readyHint")}</p>
              <div className="button-row">
                <button type="button" className="button button--primary" onClick={() => void revealCurrentPlayer()} disabled={isRevealing}>
                  {isRevealing ? t("reveal.revealing") : t("reveal.tapToReveal")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="reveal-display">{currentReveal.display}</div>
              <p className="muted-text">{currentReveal.display.includes("IMPOSTER") ? t("reveal.imposterMsg") : t("reveal.wordMsg")}</p>
              <div className="button-row">
                <button type="button" className="button button--secondary" onClick={continueAfterReveal}>
                  {isLastPlayer ? t("reveal.startDiscussion") : t("reveal.hideAndPass")}
                </button>
              </div>
            </>
          )}
          {errorMessage && <p className="alert-text">{errorMessage}</p>}
        </div>
      </section>
    );
  }

  // ──── DISCUSSION ────
  if (step === "discussion") {
    return (
      <section className="placeholder-page stack-lg">
        {backToSetupButton}
        <p className="placeholder-kicker">{t("discussion.kicker")}</p>
        <h1>{t("discussion.title")}</h1>
        <div className="surface-panel stack-lg">
          <div className={`timer-display${timeLeft <= 30 ? " alert-text" : ""}`}>{formatDuration(timeLeft)}</div>
          <div className="inline-meta">
            <span>{t("discussion.players", { n: session.player_names.length })}</span>
            <span>{t("discussion.category", { cat: resolvedCategory })}</span>
          </div>
          <p className="muted-text">{t("discussion.secretHint")}</p>
          <div className="button-row">
            <button type="button" className="button button--secondary" onClick={() => setStep("result")}>{t("discussion.endNow")}</button>
          </div>
        </div>
      </section>
    );
  }

  // ──── RESULT ────
  return (
    <section className="placeholder-page stack-lg">
      {backToSetupButton}
      <p className="placeholder-kicker">{t("result.kicker")}</p>
      <h1>{t("result.title")}</h1>
      <div className="surface-panel stack-lg">
        <div className="inline-meta">
          <span>{t("discussion.category", { cat: resolvedCategory })}</span>
          <span>{t("result.timer", { time: formatDuration(session.timer_seconds) })}</span>
          <span>{t("result.round", { n: roundCount })}</span>
        </div>
        <div className="word-title-row">
          <div className="reveal-display">{session.word}</div>
          <div className="bubble-anchor" ref={bubbleRef}>
            <button type="button" className="icon-button" aria-label={t("result.showWordDetails")} onClick={() => setIsWordInfoOpen((c) => !c)}>i</button>
            {isWordInfoOpen && (
              <div className="info-bubble stack-md">
                <div className="info-bubble__title">
                  <strong>{t("result.wordInfo")}</strong>
                  <button type="button" className="button button--ghost back-button" onClick={() => setIsWordInfoOpen(false)}>{t("close")}</button>
                </div>
                <ul className="info-list">
                  <li><strong>{t("result.word")}</strong> {session.word}</li>
                  <li><strong>{t("result.category")}</strong> {resolvedCategory}</li>
                  <li><strong>{t("result.uploadedBy")}</strong> {session.word_details.uploaded_by ?? t("result.unknown")}</li>
                  {session.word_details.description && <li><strong>{t("result.meaning")}</strong> {session.word_details.description}</li>}
                </ul>
                <p className="helper-text">{t("result.source", { source: session.word_details.source })}</p>
                <div className="meta-block">
                  <p className="helper-text">{t("result.reportWord")}</p>
                  <div className="choice-chips">
                    {REPORT_REASON_OPTIONS.map((opt) => (
                      <button key={opt.value} type="button" className={`choice-chip${reportReason === opt.value ? " choice-chip--selected" : ""}`} onClick={() => setReportReason(opt.value)}>{t(opt.labelKey)}</button>
                    ))}
                  </div>
                  <textarea className="text-area" rows={3} value={reportNotes} placeholder={t("result.optionalNote")} onChange={(e) => setReportNotes(e.target.value)} />
                  {reportMessage && <p className={reportMessage === t("result.reportSuccess") ? "helper-text" : "alert-text"}>{reportMessage}</p>}
                  <div className="button-row">
                    <button type="button" className="button button--danger" onClick={() => void reportCurrentWord()} disabled={isReporting}>{isReporting ? t("result.reporting") : t("result.sendReport")}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <p><strong>{t("result.imposter", { name: session.player_names[session.imposter_index] })}</strong></p>
        <div className="stack-md">
          <p className="helper-text">{t("result.howDidItEnd")}</p>
          <div className="choice-chips">
            {END_REASON_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" className={`choice-chip${endReason === opt.value ? " choice-chip--selected" : ""}`} onClick={() => toggleEndReason(opt.value)}>{t(opt.labelKey)}</button>
            ))}
          </div>
          {endReason === "FOUND_IMPOSTER" && (
            <div className="choice-chips">
              {IMPOSTER_FATE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" className={`choice-chip${imposterFate === opt.value ? " choice-chip--selected" : ""}`} onClick={() => setImposterFate((c) => c === opt.value ? "" : opt.value)}>{t(opt.labelKey)}</button>
              ))}
            </div>
          )}
        </div>
        <div className="button-row">
          <button type="button" className="button button--primary button--hero" onClick={() => void startGame(session.player_names)} disabled={isStarting}>{isStarting ? t("result.creating") : t("result.playAgain")}</button>
        </div>
      </div>
    </section>
  );
}
