// Online-Multiplayer-Raum (Phase F des Client-Rewrites, siehe
// ~/.claude/plans/agile-brewing-wadler.md) - "genau wie arcadedarts"
// (Tobias' Vorgabe): Host erstellt einen Raum mit 5-stelliger PIN, ein
// Gast tritt per PIN bei. Beide haben ihr EIGENES Board, jedes Geraet
// darf nur Wuerfe fuer seinen EIGENEN Spieler einspeisen (siehe
// useOnlineMatch.ts) - der geteilte Event-Log der MatchEngine ist die
// einzige Quelle der Wahrheit und wird per Realtime Database
// gespiegelt. Ohne Video-Chat (bewusst weggelassen, Tobias-Entscheidung
// 09.09.2026).
//
// BEWUSST OHNE runTransaction(): beim Testen zeigte sich, dass
// runTransaction() in dieser Umgebung (Firebase JS SDK 12.x) auf einem
// Pfad, den dieser Client noch nicht gelesen hat, zuverlaessig einen
// falschen "existiert nicht"-Zwischenstand liefert (reproduziert auch
// nachdem der Pfad zuvor per onValue() bereits erfolgreich gelesen
// wurde) - ein einfaches get() direkt davor lieferte in denselben
// Faellen immer den korrekten Wert. Alle Schreibzugriffe hier
// verwenden deshalb "erst lesen, dann schreiben" statt einer echten
// Transaktion. Fuer ein freundschaftliches 2-4-Spieler-Onlinespiel
// (keine adversarielle Nebenlaeufigkeit, seltene, meist durch
// abwechselnde Zuege ohnehin entzerrte Schreibzugriffe) ist das
// tragbare Risiko eines verlorenen Schreibzugriffs bei einem sehr
// engen Zusammentreffen zweier Aenderungen akzeptabel.
import { get, onValue, ref, remove, update, type Unsubscribe } from "firebase/database";
import { ensureSignedIn, rtdb } from "../data/firebase";
import { MatchEvent } from "../engine/matchEngine";
import { Segment } from "../engine/scoring";

export type RoomPlayer = {
  uid: string;
  profileId: string;
  name: string;
  color: string | null;
  initials: string | null;
};

export type RoomStatus = "waiting" | "playing" | "finished";

export type Room = {
  hostUid: string;
  status: RoomStatus;
  createdAt: number;
  gameId: string | null;
  settings: Record<string, unknown> | null;
  matchId: string | null;
  players: RoomPlayer[];
  events: MatchEvent[];
};

const MAX_PLAYERS = 4;

function roomRef(pin: string) {
  return ref(rtdb, `rooms/${pin}`);
}

function generatePin(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

async function readRoom(pin: string): Promise<Room | null> {
  const snap = await get(roomRef(pin));
  return snap.exists() ? (snap.val() as Room) : null;
}

// Erstellt einen neuen Raum mit einer freien (noch nicht in Benutzung
// befindlichen) PIN und dem Host als erstem Spieler. Gibt die PIN
// zurueck.
export async function createRoom(hostPlayer: Omit<RoomPlayer, "uid">): Promise<string> {
  const user = await ensureSignedIn();
  for (let attempt = 0; attempt < 5; attempt++) {
    const pin = generatePin();
    if (await readRoom(pin)) continue; // PIN schon vergeben - naechster Versuch
    const room: Room = {
      hostUid: user.uid,
      status: "waiting",
      createdAt: Date.now(),
      gameId: null,
      settings: null,
      matchId: null,
      players: [{ ...hostPlayer, uid: user.uid }],
      events: [],
    };
    await update(roomRef(pin), room);
    return pin;
  }
  throw new Error("Konnte keinen freien Raum-Code finden - bitte erneut versuchen.");
}

// Tritt einem wartenden Raum bei. Wirft bei ungueltiger/vollständiger/
// nicht mehr wartender PIN einen Fehler mit nutzerverstaendlicher
// Meldung.
export async function joinRoom(pin: string, guestPlayer: Omit<RoomPlayer, "uid">): Promise<void> {
  const user = await ensureSignedIn();
  const room = await readRoom(pin);
  if (room === null) throw new Error("Kein Raum mit dieser PIN gefunden.");
  if (room.status !== "waiting") throw new Error("Dieser Raum läuft bereits oder ist beendet.");
  if (room.players.length >= MAX_PLAYERS) throw new Error("Raum ist voll (maximal 4 Spieler).");
  if (room.players.some((p) => p.uid === user.uid)) return; // schon beigetreten - keine Doppelung
  await update(roomRef(pin), { players: [...room.players, { ...guestPlayer, uid: user.uid }] });
}

export function subscribeToRoom(pin: string, callback: (room: Room | null) => void): Unsubscribe {
  return onValue(roomRef(pin), (snap) => callback(snap.val()));
}

export async function setRoomGame(pin: string, gameId: string, settings: Record<string, unknown>): Promise<void> {
  await update(roomRef(pin), { gameId, settings });
}

// Startet die Partie: der Host uebergibt den bereits lokal erzeugten
// initialen Event-Log (MATCH_STARTED), damit alle Geraete von
// demselben Startzustand ausgehen.
export async function startRoom(pin: string, matchId: string, events: MatchEvent[]): Promise<void> {
  await update(roomRef(pin), { status: "playing", matchId, events });
}

async function appendEvent(pin: string, event: MatchEvent): Promise<void> {
  const room = await readRoom(pin);
  if (!room) return;
  await update(roomRef(pin), { events: [...room.events, event] });
}

export async function appendThrow(pin: string, segment: Segment, source: "auto" | "manual"): Promise<void> {
  const room = await readRoom(pin);
  if (!room) return;
  const seqs = room.events.filter((e) => e.type === "THROW").map((e) => (e as { payload: { throwSeq: number } }).payload.throwSeq);
  const throwSeq = seqs.length > 0 ? Math.max(...seqs) + 1 : 0;
  await update(roomRef(pin), { events: [...room.events, { type: "THROW", payload: { throwSeq, segment, source } } as MatchEvent] });
}

export async function appendConfirm(pin: string): Promise<void> {
  await appendEvent(pin, { type: "VISIT_CONFIRMED", payload: {} } as MatchEvent);
}

export async function appendCorrection(pin: string, targetThrowSeq: number, segment: Segment): Promise<void> {
  await appendEvent(pin, { type: "CORRECT_THROW", payload: { targetThrowSeq, segment } } as MatchEvent);
}

export async function undoLastEvent(pin: string): Promise<void> {
  const room = await readRoom(pin);
  if (!room || room.events.length <= 1) return; // nur MATCH_STARTED uebrig
  await update(roomRef(pin), { events: room.events.slice(0, -1) });
}

export async function finishRoom(pin: string): Promise<void> {
  await update(roomRef(pin), { status: "finished" });
}

export async function deleteRoom(pin: string): Promise<void> {
  await remove(roomRef(pin));
}
