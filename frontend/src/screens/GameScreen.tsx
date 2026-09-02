import { GameDefinition, Profile } from "../api";
import { useLiveThrows } from "../useLiveThrows";
import { BoardControlBar } from "../components/BoardControlBar";
import { PlayerScoreboard } from "../components/PlayerScoreboard";
import { GameProgress } from "../components/GameProgress";
import { GameActions } from "../components/GameActions";
import "./GameScreen.css";

type Props = {
  game: GameDefinition;
  players: Profile[];
  onExit: () => void;
};

// Einheitlicher Game Screen (SPEC §12/§13) - dasselbe Layout fuer
// jedes Spiel. Verbunden mit den echten Board-Events ueber
// useLiveThrows(); Punktestand, Target und Spielerwechsel sind
// bewusst Dummy, bis die Game Engine in Phase 7 entsteht.
export function GameScreen({ game, players, onExit }: Props) {
  const live = useLiveThrows();
  const activeIndex = players.length > 0 ? live.turnCount % players.length : 0;
  const activePlayer = players[activeIndex];
  const darts = [live.throws[0] ?? null, live.throws[1] ?? null, live.throws[2] ?? null];

  function handleExit() {
    if (confirm("Spiel verlassen? Der aktuelle Stand geht verloren (noch keine Speicherung, folgt in Phase 7).")) {
      onExit();
    }
  }

  return (
    <div className="game-screen">
      <header className="game-screen-header">
        <div className="game-screen-title">{game.name.toUpperCase()}</div>
        <BoardControlBar />
      </header>

      <PlayerScoreboard players={players} activeIndex={activeIndex} />

      <section className="active-player-panel">
        <div className="active-player-label">CURRENT PLAYER</div>
        <div className="active-player-name">{activePlayer?.name ?? "—"}</div>
        <div className="target-label">TARGET</div>
        <div className="target-value">—</div>
      </section>

      <section className="current-throw-panel">
        {darts.map((label, i) => (
          <div key={i} className="dart-slot">
            <div className="dart-slot-label">DART {i + 1}</div>
            <div className={`dart-chip ${label ? "filled" : "empty"}`}>{label ?? "—"}</div>
          </div>
        ))}
      </section>

      <GameProgress turnCount={live.turnCount} />

      <GameActions onExit={handleExit} />
    </div>
  );
}
