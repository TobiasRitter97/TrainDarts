import { useEffect, useRef, useState } from "react";
import { GameDefinition, MatchState, Profile, Segment } from "../api";
import { AutodartsAdapter, BoardStatus } from "../board/autodartsAdapter";
import { getBoardHost } from "../board/boardHost";
import * as matchesDb from "../data/matches";
import { MatchEngine, MatchEvent, MatchPlayerRef } from "./matchEngine";

function toPlayerRefs(players: Profile[]): MatchPlayerRef[] {
  return players.map((p) => ({ id: p.id, name: p.name, color: p.color, initials: p.initials }));
}

export type ResumeInfo = { matchId: string; events: MatchEvent[] };

// Verbindet eine lokal (im Browser) laufende MatchEngine direkt mit
// dem Autodarts-Board (Phase A) und persistiert den Fortschritt nach
// jeder Aenderung in Firestore (Phase E, ~/.claude/plans/agile-
// brewing-wadler.md) - kein eigenes Backend mehr im Spiel. Ein neues
// (nicht fortgesetztes) Match gilt als DAS aktive Match: ein evtl.
// noch nicht abgeschlossenes altes wird dabei implizit aufgegeben
// (dieselbe Invariante wie zuvor im Python-Backend).
export function useLocalMatch(
  game: GameDefinition,
  players: Profile[],
  settings: Record<string, unknown>,
  resume?: ResumeInfo
) {
  const engineRef = useRef<MatchEngine | null>(null);
  const [, setTick] = useState(0);
  const [boardStatus, setBoardStatus] = useState<BoardStatus>("disconnected");
  // Solange gesetzt, wird der NAECHSTE erkannte Wurf nicht als neuer Dart
  // gezaehlt, sondern an diesen Handler gegeben (Tobias-Anforderung
  // 16.09.2026: einen Dart schneller direkt ueber das echte Board
  // korrigieren, statt auf dem Touchscreen zu tippen). Bewusst ein Ref
  // und kein State: der Wert wird nur im Board-Callback gelesen, ein
  // Re-Render waere unnoetig.
  const boardCaptureRef = useRef<((segment: Segment) => void) | null>(null);

  if (!engineRef.current) {
    const matchId = resume?.matchId ?? crypto.randomUUID();
    engineRef.current = new MatchEngine(matchId, game, toPlayerRefs(players), settings, resume?.events);
  }

  function persist(): void {
    const engine = engineRef.current;
    if (!engine) return;
    matchesDb
      .saveMatch(
        engine.matchId,
        engine.game.id,
        engine.settings,
        engine.players.map((p) => p.id),
        engine.events,
        engine.finished ? "finished" : "in_progress",
        engine.winnerId
      )
      .catch((err) => console.error("Match konnte nicht gespeichert werden", err));
  }

  function refresh(): void {
    setTick((t) => t + 1);
    persist();
  }

  useEffect(() => {
    if (resume) return; // fortgesetztes Match ist bereits DAS aktive Match
    matchesDb
      .findInProgressMatch()
      .then((existing) => {
        if (existing && existing.id !== engineRef.current?.matchId) {
          return matchesDb.setStatus(existing.id, "abandoned");
        }
      })
      .finally(persist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const adapter = new AutodartsAdapter(getBoardHost(), 3180, {
      onStatusChange: setBoardStatus,
      onThrow: (label, raw) => {
        const capture = boardCaptureRef.current;
        if (capture) {
          // Genau EIN Wurf wird abgefangen - danach zaehlt wieder alles
          // normal, auch wenn der Nutzer das Korrektur-Fenster offen laesst.
          boardCaptureRef.current = null;
          capture(raw.segment ?? { number: 0, multiplier: 0 });
          refresh();
          return;
        }
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
      engineRef.current = new MatchEngine(crypto.randomUUID(), game, toPlayerRefs(players), settings);
      refresh();
    },
    // Scharfschalten/Entschaerfen der Board-Korrektur (siehe
    // boardCaptureRef). null = wieder normaler Wurf-Betrieb.
    armBoardCapture: (handler: ((segment: Segment) => void) | null) => {
      boardCaptureRef.current = handler;
    },
  };
}
