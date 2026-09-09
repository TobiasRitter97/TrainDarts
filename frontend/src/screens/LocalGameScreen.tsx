import { GameDefinition, Profile } from "../api";
import { useLocalMatch } from "../engine/useLocalMatch";
import { GameScreenView } from "./GameScreenView";

type Props = {
  game: GameDefinition;
  players: Profile[];
  settings: Record<string, unknown>;
  onExit: () => void;
};

// Duenner Wrapper um GameScreenView fuer den NEUEN Weg (Phase C des
// Client-Rewrites, ~/.claude/plans/agile-brewing-wadler.md): Match-
// State kommt aus einer lokal im Browser laufenden MatchEngine, die
// sich direkt mit dem Autodarts-Board verbindet - kein eigenes
// Backend mehr. Aktuell nur fuer Spiele mit engineFamily "x01"
// verwendet (siehe localFamilies.ts); die anderen 9 Spiele laufen bis
// Phase D weiterhin ueber GameScreen.tsx (altes Backend).
export function LocalGameScreen({ game, players, settings, onExit }: Props) {
  const local = useLocalMatch(game, players, settings);

  return (
    <GameScreenView
      match={local.state}
      game={game}
      persistsProgress={false}
      onExit={onExit}
      actions={{
        onUndo: local.undo,
        onAddThrow: local.addThrow,
        onCorrectThrow: local.correctThrow,
        onConfirm: local.confirmVisit,
        onRematch: local.rematch,
      }}
    />
  );
}
