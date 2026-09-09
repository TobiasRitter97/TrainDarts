import { GameDefinition, Profile } from "../api";
import { ResumeInfo, useLocalMatch } from "../engine/useLocalMatch";
import { GameScreenView } from "./GameScreenView";

type Props = {
  game: GameDefinition;
  players: Profile[];
  settings: Record<string, unknown>;
  resume?: ResumeInfo;
  onExit: () => void;
};

// Duenner Wrapper um GameScreenView: Match-State kommt aus einer lokal
// im Browser laufenden MatchEngine, die sich direkt mit dem Autodarts-
// Board verbindet (Phase A/C) und ihren Fortschritt in Firestore
// persistiert (Phase E, ~/.claude/plans/agile-brewing-wadler.md) - kein
// eigenes Backend mehr. Wird fuer alle 10 Spiele verwendet.
export function LocalGameScreen({ game, players, settings, resume, onExit }: Props) {
  const local = useLocalMatch(game, players, settings, resume);

  return (
    <GameScreenView
      match={local.state}
      game={game}
      persistsProgress
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
