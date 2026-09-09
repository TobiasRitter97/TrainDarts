import { useEffect, useRef, useState } from "react";
import { GameDefinition, MatchState, Profile, Segment } from "../api";
import { AutodartsAdapter, BoardStatus } from "../board/autodartsAdapter";
import { getBoardHost } from "../board/boardHost";
import { MatchEngine, MatchPlayerRef } from "./matchEngine";

function toPlayerRefs(players: Profile[]): MatchPlayerRef[] {
  return players.map((p) => ({ id: p.id, name: p.name, color: p.color, initials: p.initials }));
}

// Verbindet eine lokal (im Browser) laufende MatchEngine direkt mit
// dem Autodarts-Board (Phase A) - kein eigenes Backend mehr im Spiel.
// Persistenz (Fortsetzen nach Reload, Statistiken) folgt in Phase E;
// bis dahin lebt der Match-State nur im Speicher dieses Tabs.
export function useLocalMatch(game: GameDefinition, players: Profile[], settings: Record<string, unknown>) {
  const engineRef = useRef<MatchEngine | null>(null);
  const [, setTick] = useState(0);
  const [boardStatus, setBoardStatus] = useState<BoardStatus>("disconnected");

  function refresh() {
    setTick((t) => t + 1);
  }

  if (!engineRef.current) {
    engineRef.current = new MatchEngine(`local-${Date.now()}`, game, toPlayerRefs(players), settings);
  }

  useEffect(() => {
    const adapter = new AutodartsAdapter(getBoardHost(), 3180, {
      onStatusChange: setBoardStatus,
      onThrow: (label, raw) => {
        engineRef.current?.handleThrow(label, raw);
        refresh();
      },
      onTakeout: () => {
        engineRef.current?.confirmVisit();
        refresh();
      },
    });
    adapter.run();
    return () => adapter.stopRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engine = engineRef.current;
  const state: MatchState = engine.toDict();

  return {
    state,
    boardStatus,
    addThrow: (segment: Segment) => {
      engine.addManualThrow(segment);
      refresh();
    },
    correctThrow: (throwSeq: number, segment: Segment) => {
      engine.correctThrow(throwSeq, segment);
      refresh();
    },
    undo: () => {
      engine.undo();
      refresh();
    },
    confirmVisit: () => {
      engine.confirmVisit();
      refresh();
    },
    rematch: () => {
      engineRef.current = new MatchEngine(`local-${Date.now()}`, game, toPlayerRefs(players), settings);
      refresh();
    },
  };
}
