// 1:1-Port von backend/persistence/matches.py (Phase E des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - Firestore
// statt SQLite. Anders als bei SQL wird das Event-Log hier als
// EINGEBETTETES Array im Match-Dokument gespeichert statt in einer
// eigenen Tabelle (passt besser zu Firestores Dokumentmodell, ein
// Match-Eventlog ist klein genug fuer ein einzelnes Dokument).
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { currentUid, db, ensureSignedIn } from "./firebase";
import * as guest from "./guestStore";
import { MatchEvent } from "../engine/matchEngine";
import { computeConfigHash } from "./configHash";

export type MatchStatus = "in_progress" | "finished" | "abandoned";

export type StoredMatch = {
  id: string;
  gameId: string;
  settings: Record<string, unknown>;
  configHash: string;
  playerIds: string[];
  events: MatchEvent[];
  status: MatchStatus;
  startedAt: string;
  finishedAt: string | null;
  winnerProfileId: string | null;
};

async function matchesCollection() {
  await ensureSignedIn();
  return collection(db, "users", currentUid(), "matches");
}

function now(): string {
  return new Date().toISOString();
}

// Merkt sich den Startzeitpunkt je Match, damit er auch dann stabil
// bleibt, wenn der Lesezugriff auf das bestehende Dokument gerade
// fehlschlaegt (offline).
const startedAtCache = new Map<string, string>();

// Schreibt bei jeder Aenderung das komplette Match-Dokument neu
// (Matches bleiben klein genug, dass das unproblematisch ist) - das
// vermeidet fehleranfaellige inkrementelle Abgleiche bei Undo/Korrektur
// und ist die Grundlage fuer "Fortsetzen nach Neustart".
export async function saveMatch(
  matchId: string,
  gameId: string,
  settings: Record<string, unknown>,
  playerIds: string[],
  events: MatchEvent[],
  status: MatchStatus = "in_progress",
  winnerProfileId: string | null = null
): Promise<void> {
  // Gast-Modus: alles bleibt lokal, nichts geht nach Firestore.
  if (guest.isGuest()) {
    return guest.guestSaveMatch(matchId, gameId, settings, playerIds, events, status, winnerProfileId);
  }

  const collectionRef = await matchesCollection();
  const ref = doc(collectionRef, matchId);

  let startedAt = startedAtCache.get(matchId) ?? now();
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) startedAt = (existing.data() as StoredMatch).startedAt;
  } catch {
    // Offline: der zwischengespeicherte bzw. neu erzeugte Wert genuegt.
  }
  startedAtCache.set(matchId, startedAt);

  const match: StoredMatch = {
    id: matchId,
    gameId,
    settings,
    configHash: await computeConfigHash(gameId, settings),
    playerIds,
    events,
    status,
    startedAt,
    finishedAt: status === "finished" ? now() : null,
    winnerProfileId,
  };

  try {
    await setDoc(ref, match);
  } catch (err) {
    // Ein ABGESCHLOSSENES Spiel darf nie verloren gehen: es wandert in
    // die lokale Warteschlange und wird beim naechsten erfolgreichen
    // Verbindungsaufbau nachgereicht (siehe flushPendingMatches).
    // Zwischenstaende muessen nicht gepuffert werden - der naechste
    // Dart schreibt ohnehin das komplette Dokument neu.
    if (status === "finished") queuePendingMatch(match);
    throw err;
  }
}

// ---------------------------------------------------------------- Warteschlange

const PENDING_KEY = "darts-pending-matches";
const PENDING_LIMIT = 20;

function readPending(): StoredMatch[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as StoredMatch[]) : [];
  } catch {
    return [];
  }
}

function writePending(list: StoredMatch[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-PENDING_LIMIT)));
  } catch {
    // Privates Fenster oder Speicher voll - dann bleibt nur der
    // Versuch beim naechsten Schreiben.
  }
}

// Gleiche matchId ueberschreibt den alten Eintrag: dieselbe Partie
// landet nie doppelt in der Warteschlange und nie doppelt in Firestore.
function queuePendingMatch(match: StoredMatch): void {
  const list = readPending().filter((m) => m.id !== match.id);
  list.push(match);
  writePending(list);
}

export function pendingMatchCount(): number {
  return readPending().length;
}

// Reicht wartende Spiele nach. Wird nach dem Login und bei jedem
// "wieder online"-Ereignis aufgerufen. Was nicht durchgeht, bleibt in
// der Warteschlange stehen.
export async function flushPendingMatches(): Promise<number> {
  if (guest.isGuest()) return 0; // ein Gast laedt nichts hoch
  const list = readPending();
  if (list.length === 0) return 0;

  let collectionRef;
  try {
    collectionRef = await matchesCollection();
  } catch {
    return 0; // nicht angemeldet - spaeter noch einmal
  }

  const failed: StoredMatch[] = [];
  let uploaded = 0;
  for (const match of list) {
    try {
      await setDoc(doc(collectionRef, match.id), match);
      uploaded += 1;
    } catch {
      failed.push(match);
    }
  }
  writePending(failed);
  return uploaded;
}

export async function setStatus(matchId: string, status: MatchStatus, winnerProfileId: string | null = null): Promise<void> {
  if (guest.isGuest()) return guest.guestSetStatus(matchId, status, winnerProfileId);
  await updateDoc(doc(await matchesCollection(), matchId), {
    status,
    finishedAt: status === "finished" || status === "abandoned" ? now() : null,
    winnerProfileId,
  });
}

export async function getMatch(matchId: string): Promise<StoredMatch | null> {
  if (guest.isGuest()) return guest.guestGetMatch(matchId);
  const snap = await getDoc(doc(await matchesCollection(), matchId));
  return snap.exists() ? (snap.data() as StoredMatch) : null;
}

// Es gibt per Invariante hoechstens EIN "in_progress"-Match zur selben
// Zeit (ein neues Match setzt jedes alte unfertige sofort auf
// "abandoned", siehe useLocalMatch.ts) - kein orderBy/Index noetig.
export async function findInProgressMatch(): Promise<StoredMatch | null> {
  if (guest.isGuest()) return guest.guestFindInProgressMatch();
  const snap = await getDocs(query(await matchesCollection(), where("status", "==", "in_progress")));
  if (snap.empty) return null;
  return snap.docs[0].data() as StoredMatch;
}

export async function loadFinishedMatches(gameId?: string): Promise<StoredMatch[]> {
  if (guest.isGuest()) {
    return guest
      .guestMatches()
      .filter((m) => m.status === "finished" && (!gameId || m.gameId === gameId))
      .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  }
  const clauses = [where("status", "==", "finished")];
  if (gameId) clauses.push(where("gameId", "==", gameId));
  const snap = await getDocs(query(await matchesCollection(), ...clauses));
  const matches = snap.docs.map((d) => d.data() as StoredMatch);
  matches.sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  return matches;
}

export async function loadFinishedMatchesForProfile(profileId: string): Promise<StoredMatch[]> {
  if (guest.isGuest()) {
    return guest
      .guestMatches()
      .filter((m) => m.status === "finished" && m.playerIds.includes(profileId))
      .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  }
  const snap = await getDocs(
    query(await matchesCollection(), where("status", "==", "finished"), where("playerIds", "array-contains", profileId))
  );
  const matches = snap.docs.map((d) => d.data() as StoredMatch);
  matches.sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  return matches;
}
