import { useEffect, useRef, useState } from "react";
import { GameDefinition, MatchState, Segment } from "../api";
import { AutodartsAdapter, BoardStatus } from "../board/autodartsAdapter";
import { getBoardHost } from "../board/boardHost";
import * as matchesDb from "../data/matches";
import { MatchEngine, MatchPlayerRef } from "../engine/matchEngine";
import * as roomDb from "./roomDb";
import { Room } from "./roomDb";

// Verbindet eine gemeinsame Online-Partie (Phase F, siehe
// ~/.claude/plans/agile-brewing-wadler.md) mit dem eigenen Board: der
// geteilte Event-Log kommt aus der Realtime Database (roomDb.ts),
// jedes Geraet baut daraus lokal dieselbe MatchEngine nach (Event-
// Sourcing macht das moeglich - kein zentraler Server noetig). Board-
// Wuerfe werden nur eingespeist, wenn gerade tatsaechlich der eigene
// Spieler am Zug ist (Sicherheitsnetz gegen Fehlerkennungen vom
// falschen Board); manuelle Korrekturen/Undo darf jedes Geraet jederzeit
// ausloesen (vertrauensvolles gemeinsames Spiel, kein strenger Zwang).
export function useOnlineMatch(pin: string, game: GameDefinition, myUid: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [boardStatus, setBoardStatus] = useState<BoardStatus>("disconnected");
  const isMyTurnRef = useRef(false);
  const hasSavedFinishedRef = useRef(false);

  useEffect(() => roomDb.subscribeToRoom(pin, setRoom), [pin]);

  let engine: MatchEngine | null = null;
  if (room && room.matchId) {
    const playerRefs: MatchPlayerRef[] = room.players.map((p) => ({
      id: p.profileId,
      name: p.name,
      color: p.color,
      initials: p.initials,
    }));
    try {
      engine = new MatchEngine(room.matchId, game, playerRefs, room.settings ?? {}, room.events);
    } catch {
      engine = null;
    }
  }

  const state: MatchState | null = engine ? engine.toDict() : null;
  const myPlayer = room?.players.find((p) => p.uid === myUid) ?? null;
  isMyTurnRef.current = Boolean(state && myPlayer && state.activePlayerId === myPlayer.profileId);

  useEffect(() => {
    const adapter = new AutodartsAdapter(getBoardHost(), 3180, {
      onStatusChange: setBoardStatus,
      onThrow: (_label, raw) => {
        if (!isMyTurnRef.current) return;
        roomDb.appendThrow(pin, raw.segment ?? { number: 0, multiplier: 0 }, "auto").catch((err) => console.error(err));
      },
      onTakeout: () => {
        if (!isMyTurnRef.current) return;
        roomDb.appendConfirm(pin).catch((err) => console.error(err));
      },
    });
    adapter.run();
    return () => adapter.stopRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Sobald das Match zu Ende ist, traegt JEDES Geraet das Ergebnis in
  // seine EIGENE Firestore-Historie ein (Phase E) - Firestore-Daten
  // sind pro Firebase-Identitaet getrennt, daher muss jeder
  // Teilnehmer sein eigenes Match selbst speichern, damit es in der
  // eigenen Statistik auftaucht.
  useEffect(() => {
    if (!engine || !engine.finished || !room || hasSavedFinishedRef.current) return;
    hasSavedFinishedRef.current = true;
    matchesDb
      .saveMatch(
        engine.matchId,
        engine.game.id,
        engine.settings,
        engine.players.map((p) => p.id),
        engine.events,
        "finished",
        engine.winnerId
      )
      .catch((err) => console.error("Online-Match konnte nicht gespeichert werden", err));
    roomDb.finishRoom(pin).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine?.finished]);

  return {
    room,
    state,
    boardStatus,
    isMyTurn: isMyTurnRef.current,
    addThrow: (segment: Segment) => roomDb.appendThrow(pin, segment, "manual"),
    correctThrow: (throwSeq: number, segment: Segment) => roomDb.appendCorrection(pin, throwSeq, segment),
    undo: () => roomDb.undoLastEvent(pin),
    confirmVisit: () => roomDb.appendConfirm(pin),
  };
}
