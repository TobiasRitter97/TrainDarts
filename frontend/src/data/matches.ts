// 1:1-Port von backend/persistence/matches.py (Phase E des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - Firestore
// statt SQLite. Anders als bei SQL wird das Event-Log hier als
// EINGEBETTETES Array im Match-Dokument gespeichert statt in einer
// eigenen Tabelle (passt besser zu Firestores Dokumentmodell, ein
// Match-Eventlog ist klein genug fuer ein einzelnes Dokument).
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { currentUid, db, ensureSignedIn } from "./firebase";
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

// Schreibt bei jeder Aenderung das komplette Match-Dokument neu
// (Matches bleiben klein genug, dass das unproblematisch ist) - das
// vermeidet fehleranfaellige inkrementelle Abgleiche bei Undo/Korrektur.
export async function saveMatch(
  matchId: string,
  gameId: string,
  settings: Record<string, unknown>,
  playerIds: string[],
  events: MatchEvent[],
  status: MatchStatus = "in_progress",
  winnerProfileId: string | null = null
): Promise<void> {
  const ref = doc(await matchesCollection(), matchId);
  const existing = await getDoc(ref);
  const startedAt = existing.exists() ? (existing.data() as StoredMatch).startedAt : now();
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
  await setDoc(ref, match);
}

export async function setStatus(matchId: string, status: MatchStatus, winnerProfileId: string | null = null): Promise<void> {
  await updateDoc(doc(await matchesCollection(), matchId), {
    status,
    finishedAt: status === "finished" || status === "abandoned" ? now() : null,
    winnerProfileId,
  });
}

export async function getMatch(matchId: string): Promise<StoredMatch | null> {
  const snap = await getDoc(doc(await matchesCollection(), matchId));
  return snap.exists() ? (snap.data() as StoredMatch) : null;
}

// Es gibt per Invariante hoechstens EIN "in_progress"-Match zur selben
// Zeit (ein neues Match setzt jedes alte unfertige sofort auf
// "abandoned", siehe useLocalMatch.ts) - kein orderBy/Index noetig.
export async function findInProgressMatch(): Promise<StoredMatch | null> {
  const snap = await getDocs(query(await matchesCollection(), where("status", "==", "in_progress")));
  if (snap.empty) return null;
  return snap.docs[0].data() as StoredMatch;
}

export async function loadFinishedMatches(gameId?: string): Promise<StoredMatch[]> {
  const clauses = [where("status", "==", "finished")];
  if (gameId) clauses.push(where("gameId", "==", gameId));
  const snap = await getDocs(query(await matchesCollection(), ...clauses));
  const matches = snap.docs.map((d) => d.data() as StoredMatch);
  matches.sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  return matches;
}

export async function loadFinishedMatchesForProfile(profileId: string): Promise<StoredMatch[]> {
  const snap = await getDocs(
    query(await matchesCollection(), where("status", "==", "finished"), where("playerIds", "array-contains", profileId))
  );
  const matches = snap.docs.map((d) => d.data() as StoredMatch);
  matches.sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""));
  return matches;
}
