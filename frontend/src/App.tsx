import { useEffect, useState } from "react";
import { Profile } from "./api";
import { BoardControlBar } from "./components/BoardControlBar";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen, LocalStartInfo } from "./screens/GameSetupScreen";
import { LocalGameScreen } from "./screens/LocalGameScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { PiSettingsModal } from "./screens/PiSettingsModal";
import { BoardDebugScreen } from "./screens/BoardDebugScreen";
import { getStoredPiIp } from "./piConnection";
import * as matchesDb from "./data/matches";
import * as profilesDb from "./data/profiles";
import { ResumeInfo } from "./engine/useLocalMatch";
import { STATIC_GAMES } from "./staticGames";
import "./App.css";

type View =
  | { screen: "hub" }
  | { screen: "setup"; gameId: string }
  | { screen: "local-game"; session: LocalStartInfo; resume?: ResumeInfo }
  | { screen: "profiles" }
  | { screen: "board-debug" };

type PendingResumeInfo = { matchId: string; gameId: string; gameName: string; playerNames: string[] };

// Ob die Pi-Einstellungen automatisch beim ersten Laden vorgeschlagen
// werden sollten (Vercel-Deployment). NUR ein Vorschlag, keine Sperre
// (Tobias-Feedback 08.09.2026: die Seite muss immer erreichbar
// bleiben) - der Nutzer kann das Overlay jederzeit schliessen und/oder
// spaeter ueber den "Einstellungen"-Knopf im Header erneut oeffnen.
// Seit dem Client-Rewrite (~/.claude/plans/agile-brewing-wadler.md)
// braucht nur noch die Board-Verbindung (Phase A) eine gespeicherte
// IP - Profile/Statistiken kommen aus Firestore, kein Backend-Probe
// mehr noetig.
function useShouldSuggestPiSettings(): boolean {
  return !import.meta.env.DEV && !getStoredPiIp();
}

// Fortsetzen-Dialog nach Neustart: weder automatisch fortsetzen noch
// verwerfen - einmal beim Laden der App pruefen und den Nutzer
// entscheiden lassen. Seit Phase E kommt das aus Firestore
// (matchesDb.findInProgressMatch()) statt vom eigenen Backend.
export default function App() {
  const [view, setView] = useState<View>({ screen: "hub" });
  const [pendingResume, setPendingResume] = useState<PendingResumeInfo | null>(null);
  const suggestPiSettings = useShouldSuggestPiSettings();
  const [showPiSettings, setShowPiSettings] = useState(suggestPiSettings);

  useEffect(() => {
    matchesDb
      .findInProgressMatch()
      .then(async (match) => {
        if (!match) return;
        const game = STATIC_GAMES.find((g) => g.id === match.gameId);
        const profiles = await Promise.all(match.playerIds.map((pid) => profilesDb.getProfile(pid)));
        setPendingResume({
          matchId: match.id,
          gameId: match.gameId,
          gameName: game?.name ?? match.gameId,
          playerNames: profiles.filter((p): p is Profile => p !== null).map((p) => p.name),
        });
      })
      .catch(() => setPendingResume(null));
  }, []);

  async function handleResume() {
    if (!pendingResume) return;
    const match = await matchesDb.getMatch(pendingResume.matchId);
    const game = STATIC_GAMES.find((g) => g.id === pendingResume.gameId);
    if (!match || !game) {
      setPendingResume(null);
      return;
    }
    const profiles = (await Promise.all(match.playerIds.map((pid) => profilesDb.getProfile(pid)))).filter(
      (p): p is Profile => p !== null
    );
    setPendingResume(null);
    setView({
      screen: "local-game",
      session: { game, players: profiles, settings: match.settings },
      resume: { matchId: match.id, events: match.events },
    });
  }

  async function handleAbandon() {
    if (!pendingResume) return;
    await matchesDb.setStatus(pendingResume.matchId, "abandoned");
    setPendingResume(null);
  }

  return (
    <div className="app-shell">
      {view.screen !== "local-game" && (
        <header className="app-header">
          <div className="app-title">DARTS TRAINING PLATFORM</div>
          <div className="app-header-actions">
            {view.screen !== "profiles" && (
              <button className="btn-outline" onClick={() => setView({ screen: "profiles" })}>
                PROFILE
              </button>
            )}
            {view.screen !== "board-debug" && (
              <button className="btn-outline" onClick={() => setView({ screen: "board-debug" })}>
                🔧 BOARD-TEST
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
            onStart={(local) => setView({ screen: "local-game", session: local })}
          />
        )}
        {view.screen === "local-game" && (
          <LocalGameScreen
            game={view.session.game}
            players={view.session.players}
            settings={view.session.settings}
            resume={view.resume}
            onExit={() => setView({ screen: "hub" })}
          />
        )}
        {view.screen === "profiles" && <ProfileScreen onBack={() => setView({ screen: "hub" })} />}
        {view.screen === "board-debug" && <BoardDebugScreen onBack={() => setView({ screen: "hub" })} />}
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
