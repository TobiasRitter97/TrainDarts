import { useEffect, useState } from "react";
import { api, PendingResume } from "./api";
import { BoardControlBar } from "./components/BoardControlBar";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen } from "./screens/GameSetupScreen";
import { GameScreen } from "./screens/GameScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { clearStoredPiIp, getStoredPiIp } from "./piConnection";
import "./App.css";

type View = { screen: "hub" } | { screen: "setup"; gameId: string } | { screen: "game" } | { screen: "profiles" };

// Vercel-Deployment (kein Backend am selben Origin): erst pruefen, ob
// ueberhaupt eine Backend-Verbindung noetig/vorhanden ist, bevor die
// eigentliche App startet. Im Dev-Betrieb und wenn das Backend das
// Frontend selbst ausliefert (same-origin funktioniert einfach),
// entfaellt die Abfrage automatisch - siehe piConnection.ts.
function useConnectionGate() {
  const [checking, setChecking] = useState(true);
  const [needsConnect, setNeedsConnect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (import.meta.env.DEV || getStoredPiIp()) {
        if (!cancelled) {
          setNeedsConnect(false);
          setChecking(false);
        }
        return;
      }
      try {
        const res = await fetch("/api/board/info", { signal: AbortSignal.timeout(3000) });
        if (!cancelled) {
          setNeedsConnect(!res.ok);
          setChecking(false);
        }
      } catch {
        if (!cancelled) {
          setNeedsConnect(true);
          setChecking(false);
        }
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { checking, needsConnect, setNeedsConnect };
}

// Fortsetzen-Dialog nach Neustart (docs/ARCHITEKTUR.md Abschnitt 8):
// weder automatisch fortsetzen noch verwerfen - einmal beim Laden der
// App pruefen und den Nutzer entscheiden lassen.
export default function App() {
  const [view, setView] = useState<View>({ screen: "hub" });
  const [pendingResume, setPendingResume] = useState<PendingResume | null>(null);
  const { checking, needsConnect, setNeedsConnect } = useConnectionGate();

  useEffect(() => {
    if (checking || needsConnect) return;
    api
      .getPendingResume()
      .then(setPendingResume)
      .catch(() => setPendingResume(null));
  }, [checking, needsConnect]);

  if (checking) {
    return null;
  }

  if (needsConnect) {
    return <ConnectScreen onConnected={() => setNeedsConnect(false)} />;
  }

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

  function handleChangePi() {
    if (!confirm("Pi-Verbindung zurücksetzen? Du musst die IP danach neu eingeben.")) return;
    clearStoredPiIp();
    setNeedsConnect(true);
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
            {getStoredPiIp() && (
              <button className="icon-btn" title="Pi-Verbindung ändern" onClick={handleChangePi}>
                🔧
              </button>
            )}
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
    </div>
  );
}
