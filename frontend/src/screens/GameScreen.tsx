import { api, GameDefinition, Profile } from "../api";
import { useMatchState } from "../useMatchState";
import { BoardControlBar } from "../components/BoardControlBar";
import { PlayerScoreboard } from "../components/PlayerScoreboard";
import { CheckoutRouteDisplay } from "../components/CheckoutRouteDisplay";
import { GameProgress } from "../components/GameProgress";
import { GameActions } from "../components/GameActions";
import { ResultScreen } from "./ResultScreen";
import "./GameScreen.css";

type Props = {
  game: GameDefinition;
  players: Profile[];
  settings: Record<string, unknown>;
  onExit: () => void;
};

// Einheitlicher Game Screen (SPEC §12/§13) - dasselbe Layout fuer
// jedes Spiel. Zeigt den echten Match-Zustand aus der Game Engine
// (Phase 7): Punktestand, aktiver Spieler, Target, Checkout-Vorschlag,
// die drei Dart-Felder der laufenden Aufnahme und die Runde. Bei
// Spielende wechselt der Screen automatisch zum Result Screen.
export function GameScreen({ game, players, settings, onExit }: Props) {
  const match = useMatchState();

  function handleExit() {
    if (confirm("Spiel verlassen? Der Fortschritt geht verloren (noch keine Speicherung, folgt in Phase 8).")) {
      onExit();
    }
  }

  async function handleRematch() {
    await api.createMatch(game.id, players.map((p) => p.id), settings);
  }

  if (!match) {
    return <p className="screen-note">Warte auf Spielstart…</p>;
  }

  if (match.finished) {
    return <ResultScreen match={match} onRematch={handleRematch} onExit={onExit} />;
  }

  const darts = [match.currentVisitThrows[0] ?? null, match.currentVisitThrows[1] ?? null, match.currentVisitThrows[2] ?? null];
  const activePlayer = match.players.find((p) => p.id === match.activePlayerId);

  return (
    <div className="game-screen">
      <header className="game-screen-header">
        <div className="game-screen-title">{game.name.toUpperCase()}</div>
        <BoardControlBar />
      </header>

      <PlayerScoreboard players={match.players} activePlayerId={match.activePlayerId} />

      <section className="active-player-panel">
        <div className="active-player-label">CURRENT PLAYER</div>
        <div className="active-player-name">{activePlayer?.name ?? "—"}</div>
        {match.target && (
          <>
            <div className="target-label">TARGET</div>
            <div className="target-value">{match.target}</div>
          </>
        )}
      </section>

      <CheckoutRouteDisplay route={match.checkoutSuggestion} />

      <section className="current-throw-panel">
        {darts.map((label, i) => (
          <div key={i} className="dart-slot">
            <div className="dart-slot-label">DART {i + 1}</div>
            <div className={`dart-chip ${label ? "filled" : "empty"}`}>{label ?? "—"}</div>
          </div>
        ))}
      </section>

      <GameProgress round={match.round} legNumber={match.legNumber} />

      <GameActions onExit={handleExit} />
    </div>
  );
}
