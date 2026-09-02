type Props = {
  round: number;
  legNumber: number | null;
};

// SPEC §12: Rundenanzeige, jetzt aus der echten Game Engine (Phase 7).
// Leg-Nummer nur bei Spielen mit Legs (170).
export function GameProgress({ round, legNumber }: Props) {
  return (
    <div className="game-progress">
      ROUND {round}
      {legNumber !== null && ` · LEG ${legNumber}`}
    </div>
  );
}
