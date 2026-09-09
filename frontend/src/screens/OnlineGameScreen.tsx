import { GameDefinition } from "../api";
import { useOnlineMatch } from "../online/useOnlineMatch";
import { GameScreenView } from "./GameScreenView";

type Props = {
  pin: string;
  game: GameDefinition;
  myUid: string;
  onExit: () => void;
};

// Duenner Wrapper um GameScreenView fuer eine laufende Online-Partie
// (Phase F, ~/.claude/plans/agile-brewing-wadler.md) - Match-State kommt
// aus useOnlineMatch (geteilter Event-Log ueber Realtime Database,
// jedes Geraet mit seinem eigenen Board).
export function OnlineGameScreen({ pin, game, myUid, onExit }: Props) {
  const online = useOnlineMatch(pin, game, myUid);

  if (!online.state) {
    return <p className="screen-note">Warte auf Spielstart…</p>;
  }

  return (
    <GameScreenView
      match={online.state}
      game={game}
      persistsProgress
      canAct={online.isMyTurn}
      onExit={onExit}
      actions={{
        onUndo: online.undo,
        onAddThrow: online.addThrow,
        onCorrectThrow: online.correctThrow,
        onConfirm: online.confirmVisit,
        // Ein echtes Rematch braeuchte einen komplett neuen Raum (neue
        // PIN, beide Geraete muessten erneut beitreten) - fuer Phase F
        // v1 fuehrt REMATCH deshalb einfach zurueck zum Game Hub, von
        // wo aus ein neuer Online-Raum erstellt werden kann.
        onRematch: onExit,
      }}
    />
  );
}
