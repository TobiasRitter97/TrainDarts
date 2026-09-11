import { useEffect, useRef, useState } from "react";
import { Profile } from "./api";
import { BoardControlBar } from "./components/BoardControlBar";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen, LocalStartInfo } from "./screens/GameSetupScreen";
import { LocalGameScreen } from "./screens/LocalGameScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { PiSettingsModal } from "./screens/PiSettingsModal";
import { BoardDebugScreen } from "./screens/BoardDebugScreen";
import { OnlineLobbyScreen } from "./screens/OnlineLobbyScreen";
import { OnlineRoomScreen } from "./screens/OnlineRoomScreen";
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
  | { screen: "board-debug" }
  | { screen: "online-lobby" }
  | { screen: "online-room"; pin: string; myProfile: Profile };

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
  // Der Dialog ("Fortsetzen?"/"Verwerfen") poppt nur EINMAL automatisch
  // auf (beim allerersten Laden der Seite) - nicht jedes Mal, wenn man
  // z.B. nach "Spiel verlassen" wieder im Game Hub landet, das waere
  // aufdringlich. Stattdessen erscheint dann ein dauerhafter Button im
  // Header (Tobias-Feedback 10.09.2026: vorher kam man ohne
  // Seiten-Neuladen gar nicht mehr an ein verlassenes Spiel heran).
  const [showResumeModal, setShowResumeModal] = useState(false);
  const hasPromptedRef = useRef(false);
  const suggestPiSettings = useShouldSuggestPiSettings();
  const [showPiSettings, setShowPiSettings] = useState(suggestPiSettings);

  useEffect(() => {
    if (view.screen !== "hub") return;
    matchesDb
      .findInProgressMatch()
      .then(async (match) => {
        if (!match) {
          setPendingResume(null);
          return;
        }
        const game = STATIC_GAMES.find((g) => g.id === match.gameId);
        const profiles = await Promise.all(match.playerIds.map((pid) => profilesDb.getProfile(pid)));
        setPendingResume({
          matchId: match.id,
          gameId: match.gameId,
          gameName: game?.name ?? match.gameId,
          playerNames: profiles.filter((p): p is Profile => p !== null).map((p) => p.name),
        });
        if (!hasPromptedRef.current) {
          hasPromptedRef.current = true;
          setShowResumeModal(true);
        }
      })
      .catch(() => setPendingResume(null));
  }, [view.screen]);

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
    setShowResumeModal(false);
    setView({
      screen: "local-game",
      session: { game, players: profiles, settings: match.settings },
      resume: { matchId: match.id, events: match.events },
    });
  }

  async function handleAbandon() {
    if (!pendingResume) return;
    setShowResumeModal(false);
    await matchesDb.setStatus(pendingResume.matchId, "abandoned");
    setPendingResume(null);
  }

  return (
    <div className="app-shell">
      {view.screen !== "local-game" && view.screen !== "online-room" && (
        <header className="app-header">
          <div className="app-title">DARTS TRAINING PLATFORM</div>
          <div className="app-header-actions">
            {pendingResume && (
              <button className="btn-primary" onClick={handleResume}>
                ▶ Zurück zum aktiven Spiel
              </button>
            )}
            {view.screen !== "online-lobby" && (
              <button className="btn-outline" onClick={() => setView({ screen: "online-lobby" })}>
                🌐 ONLINE
              </button>
            )}
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
        {view.screen === "online-lobby" && (
          <OnlineLobbyScreen
            onBack={() => setView({ screen: "hub" })}
            onEnterRoom={(pin, myProfile) => setView({ screen: "online-room", pin, myProfile })}
          />
        )}
        {view.screen === "online-room" && (
          <OnlineRoomScreen pin={view.pin} myProfile={view.myProfile} onExit={() => setView({ screen: "hub" })} />
        )}
      </main>

      {pendingResume && showResumeModal && (
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
