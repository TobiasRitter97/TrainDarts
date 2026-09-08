import { useEffect, useState } from "react";
import { api, PendingResume } from "./api";
import { BoardControlBar } from "./components/BoardControlBar";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen } from "./screens/GameSetupScreen";
import { GameScreen } from "./screens/GameScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { PiSettingsModal } from "./screens/PiSettingsModal";
import { getStoredPiIp } from "./piConnection";
import "./App.css";

type View = { screen: "hub" } | { screen: "setup"; gameId: string } | { screen: "game" } | { screen: "profiles" };

// Ob die Pi-Einstellungen automatisch beim ersten Laden vorgeschlagen
// werden sollten (Vercel-Deployment ohne Backend am selben Origin).
// NUR ein Vorschlag, keine Sperre (Tobias-Feedback 08.09.2026: die
// Seite muss immer erreichbar bleiben) - der Nutzer kann das Overlay
// jederzeit schliessen und/oder spaeter ueber den "Einstellungen"-
// Knopf im Header erneut oeffnen.
function useShouldSuggestPiSettings(): boolean {
  const [suggest, setSuggest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (import.meta.env.DEV || getStoredPiIp()) return;
      try {
        const res = await fetch("/api/board/info", { signal: AbortSignal.timeout(3000) });
        if (!cancelled && !res.ok) setSuggest(true);
      } catch {
        if (!cancelled) setSuggest(true);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return suggest;
}

// Fortsetzen-Dialog nach Neustart (docs/ARCHITEKTUR.md Abschnitt 8):
// weder automatisch fortsetzen noch verwerfen - einmal beim Laden der
// App pruefen und den Nutzer entscheiden lassen.
export default function App() {
  const [view, setView] = useState<View>({ screen: "hub" });
  const [pendingResume, setPendingResume] = useState<PendingResume | null>(null);
  const suggestPiSettings = useShouldSuggestPiSettings();
  const [showPiSettings, setShowPiSettings] = useState(false);

  useEffect(() => {
    if (suggestPiSettings) setShowPiSettings(true);
  }, [suggestPiSettings]);

  useEffect(() => {
    api
      .getPendingResume()
      .then(setPendingResume)
      .catch(() => setPendingResume(null));
  }, []);

  async function handleResume() {
    if (!pendingResume) return;
    await api.resumeMatch(pendingResume.matchId);
    setPendingResume(null);
    setView({ screen: "game" });
  }

  async function handleAbandon() {
    if (!pendingResume) return;
    await api.abandonMatch(pendingResume.matchId);
    setPendingResume(null);
  }

  return (
    <div className="app-shell">
      {view.screen !== "game" && (
        <header className="app-header">
          <div className="app-title">DARTS TRAINING PLATFORM</div>
          <div className="app-header-actions">
            {view.screen !== "profiles" && (
              <button className="btn-outline" onClick={() => setView({ screen: "profiles" })}>
                PROFILE
              </button>
            )}
            <button className="btn-outline" onClick={() => setShowPiSettings(true)}>
              ⚙ EINSTELLUNGEN
            </button>
            <BoardControlBar />
          </div>
        </header>
      )}
      <main className="app-main">
        {view.screen === "hub" && (
          <GameHubScreen onSelectGame={(gameId) => setView({ screen: "setup", gameId })} />
        )}
        {view.screen === "setup" && (
          <GameSetupScreen
            gameId={view.gameId}
            onBack={() => setView({ screen: "hub" })}
            onStart={() => setView({ screen: "game" })}
          />
        )}
        {view.screen === "game" && <GameScreen onExit={() => setView({ screen: "hub" })} />}
        {view.screen === "profiles" && <ProfileScreen onBack={() => setView({ screen: "hub" })} />}
      </main>

      {pendingResume && (
        <div className="resume-overlay">
          <div className="resume-modal">
            <h3>Angefangenes Spiel fortsetzen?</h3>
            <p className="screen-note">
              {pendingResume.gameName} · {pendingResume.playerNames.join(", ")}
            </p>
            <div className="resume-actions">
              <button className="btn-primary" onClick={handleResume}>
                Fortsetzen
              </button>
              <button className="btn-secondary" onClick={handleAbandon}>
                Verwerfen
              </button>
            </div>
          </div>
        </div>
      )}

      {showPiSettings && <PiSettingsModal onClose={() => setShowPiSettings(false)} />}
    </div>
  );
}
