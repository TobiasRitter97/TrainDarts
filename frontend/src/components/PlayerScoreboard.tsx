import { Profile } from "../api";

type Props = {
  players: Profile[];
  activeIndex: number;
};

// SPEC §12/§13: alle Spieler auf einen Blick, aktiver Spieler klar
// erkennbar (Accent-Border + leichte Hintergrundaenderung, keine
// Animation). Score ist in Phase 6 bewusst Dummy (0) - echte
// Punktestaende kommen mit der Game Engine in Phase 7.
export function PlayerScoreboard({ players, activeIndex }: Props) {
  return (
    <div className="player-scoreboard">
      {players.map((player, i) => (
        <div key={player.id} className={`scoreboard-tile ${i === activeIndex ? "active" : ""}`}>
          <div className="scoreboard-name">{player.name}</div>
          <div className="scoreboard-score">0</div>
        </div>
      ))}
    </div>
  );
}
