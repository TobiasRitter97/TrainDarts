type Props = {
  turnCount: number;
};

// SPEC §12: Rundenanzeige. In Phase 6 nur die laufende Nummer ohne
// Gesamtzahl - die haengt von Game Settings/Duration ab, was erst mit
// der Game Engine (Phase 7) ausgewertet wird.
export function GameProgress({ turnCount }: Props) {
  return <div className="game-progress">ROUND {turnCount + 1}</div>;
}
