import { useEffect, useState } from "react";
import { api, GameDefinition } from "../api";
import { useMatchState } from "../useMatchState";
import { GameScreenView } from "./GameScreenView";

type Props = {
  onExit: () => void;
};

// Duenner Wrapper um GameScreenView fuer den ALTEN Weg (Match-State
// per WebSocket vom eigenen Python-Backend, siehe useMatchState.ts) -
// wird nach Phase D schrittweise durch LocalGameScreen.tsx ersetzt
// (siehe ~/.claude/plans/agile-brewing-wadler.md), bleibt bis dahin
// fuer die noch nicht auf die Client-Engine portierten 9 Spiele in
// Benutzung.
export function GameScreen({ onExit }: Props) {
  const match = useMatchState();
  const [game, setGame] = useState<GameDefinition | null>(null);

  useEffect(() => {
    if (!match) return;
    api
      .listGames()
      .then((list) => {
        setGame((prev) => (prev?.id === match.gameId ? prev : list.find((g) => g.id === match.gameId) ?? null));
      })
      .catch(() => {});
  }, [match?.gameId]);

  if (!match || !game) {
    return <p className="screen-note">Warte auf Spielstart…</p>;
  }

  return (
    <GameScreenView
      match={match}
      game={game}
      persistsProgress
      onExit={onExit}
      actions={{
        onUndo: () => api.undoMatch(match.matchId),
        onAddThrow: (segment) => api.addThrow(match.matchId, segment),
        onCorrectThrow: (throwSeq, segment) => api.correctThrow(match.matchId, throwSeq, segment),
        onConfirm: () => api.confirmVisit(match.matchId),
        onRematch: () => api.createMatch(game.id, match.players.map((p) => p.id), match.settings),
      }}
    />
  );
}
