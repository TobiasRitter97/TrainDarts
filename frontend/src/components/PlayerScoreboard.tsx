import { MatchPlayer } from "../api";

type Props = {
  players: MatchPlayer[];
  activePlayerId: string;
};

// SPEC §12/§13: alle Spieler auf einen Blick, aktiver Spieler klar
// erkennbar (Accent-Border + leichte Hintergrundaenderung, keine
// Animation). Score kommt jetzt aus der echten Game Engine (Phase 7).
export function PlayerScoreboard({ players, activePlayerId }: Props) {
  return (
    <div className="player-scoreboard">
      {players.map((player) => (
        <div key={player.id} className={`scoreboard-tile ${player.id === activePlayerId ? "active" : ""}`}>
          <div className="scoreboard-name">{player.name}</div>
          <div className="scoreboard-score">{player.score ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}
