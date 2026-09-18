// Gast-Modus (Tobias-Anforderung 17.09.2026): spielen ohne Konto.
//
// Ein Gast bekommt bewusst KEINE Firebase-Identitaet - signInAnonymously
// bleibt draussen, es entstehen keine neuen anonymen Konten. Profile und
// Matches eines Gastes liegen ausschliesslich im localStorage dieses
// Browsers.
//
// Absicht dieses Moduls: die Gast-Variante hat exakt dieselben
// Funktionen und Datenformen wie die Firestore-Variante. Dadurch
// koennen profiles.ts und matches.ts intern umschalten und ALLE
// bestehenden Aufrufer (App, PlayerPicker, ProfileScreen, StatsScreen,
// useLocalMatch, gameStats) bleiben unveraendert - der eingeloggte
// Pfad wird durch den Gast-Modus nicht komplizierter.
import { Profile } from "../api";
import { MatchEvent } from "../engine/matchEngine";
import { computeConfigHash } from "./configHash";
import { assertNameFree, findNameConflict, isSameName, ProfileNameError, validateName } from "./profileNames";
import type { MatchStatus, StoredMatch } from "./matches";

const MODE_KEY = "darts-guest-mode";
const PROFILES_KEY = "darts-guest-profiles";
const MATCHES_KEY = "darts-guest-matches";
const LAST_NAMES_KEY = "darts-guest-last-names";

export const MAX_GUEST_PLAYERS = 4;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privates Fenster oder Speicher voll - der Gast-Modus ist
    // ausdruecklich fluechtig, ein Fehlschlag ist kein Drama.
  }
}

// ---------------------------------------------------------------- Modus

// Im Speicher gehalten, damit ein Wechsel sofort greift (localStorage
// wird nur zum Ueberdauern eines Neuladens benutzt).
let guestActive = readJson<boolean>(MODE_KEY, false);

export function isGuest(): boolean {
  return guestActive;
}

export function enterGuestMode(): void {
  guestActive = true;
  writeJson(MODE_KEY, true);
}

export function leaveGuestMode(): void {
  guestActive = false;
  writeJson(MODE_KEY, false);
}

// ---------------------------------------------------------------- Namen

export function lastGuestNames(): string[] {
  return readJson<string[]>(LAST_NAMES_KEY, []);
}

export function rememberGuestNames(names: string[]): void {
  writeJson(LAST_NAMES_KEY, names.filter((n) => n.trim().length > 0).slice(0, MAX_GUEST_PLAYERS));
}

// ---------------------------------------------------------------- Profile

function now(): string {
  return new Date().toISOString();
}

export function guestProfiles(): Profile[] {
  return readJson<Profile[]>(PROFILES_KEY, []);
}

export function guestListProfiles(includeGuests = false, includeArchived = false): Profile[] {
  return guestProfiles()
    .filter((p) => p.merged_into_profile_id === null)
    .filter((p) => includeArchived || p.archived_at === null)
    .filter((p) => includeGuests || !p.is_guest)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function guestGetProfile(profileId: string): Profile | null {
  return guestProfiles().find((p) => p.id === profileId) ?? null;
}

// Dieselben Namensregeln wie fuer Konto-Profile, nur ohne Firestore:
// eindeutig innerhalb des Gast-Speichers dieses Browsers.
export function guestCreateProfile(data: { name: string; initials?: string; color?: string; is_guest?: boolean }): Profile {
  const name = validateName(data.name);
  assertNameFree(name, guestListProfiles(true, true));
  const profile: Profile = {
    id: crypto.randomUUID(),
    name,
    initials: data.initials ?? null,
    color: data.color ?? null,
    is_guest: data.is_guest ? 1 : 0,
    merged_into_profile_id: null,
    archived_at: null,
    created_at: now(),
  };
  writeJson(PROFILES_KEY, [...guestProfiles(), profile]);
  return profile;
}

export function guestUpdateProfile(profileId: string, data: { name?: string; initials?: string; color?: string }): Profile | null {
  const list = guestProfiles();
  const index = list.findIndex((p) => p.id === profileId);
  if (index < 0) return null;
  const updated = { ...list[index] };
  if (data.name !== undefined) {
    const name = validateName(data.name);
    // Bleibt der Name derselbe, wird nicht geprueft - unveraendertes
    // Speichern muss immer gehen.
    if (!isSameName(name, list[index].name)) {
      assertNameFree(name, guestListProfiles(true, true), profileId);
    }
    updated.name = name;
  }
  if (data.initials !== undefined) updated.initials = data.initials;
  if (data.color !== undefined) updated.color = data.color;
  list[index] = updated;
  writeJson(PROFILES_KEY, list);
  return updated;
}

// Deaktivieren und Reaktivieren wie bei Konto-Profilen - inklusive
// Schutz des letzten aktiven Profils.
export function guestArchiveProfile(profileId: string): void {
  const active = guestListProfiles(true, false);
  if (active.length <= 1 && active.some((p) => p.id === profileId)) {
    throw new ProfileNameError("This is your last active profile. Create another one before deactivating it.");
  }
  const list = guestProfiles().map((p) => (p.id === profileId ? { ...p, archived_at: now() } : p));
  writeJson(PROFILES_KEY, list);
}

export function guestReactivateProfile(profileId: string): void {
  const list = guestProfiles().map((p) => (p.id === profileId ? { ...p, archived_at: null } : p));
  writeJson(PROFILES_KEY, list);
}

// Legt fuer die eingegebenen Namen Profile an. Leere Felder werden zu
// "Player 1", "Player 2" usw. - ein Gast soll nicht tippen MUESSEN.
//
// Gibt es einen Namen schon, wird das bestehende Profil wiederverwendet:
// sonst haette jedes erneute Betreten des Gast-Modus dieselben Spieler
// ein weiteres Mal angelegt.
export function createGuestPlayers(names: string[]): Profile[] {
  const typed = names.map((n) => n.trim());
  rememberGuestNames(typed);

  // Leere Felder bekommen "Player N". N ist die erste Zahl, die in
  // DIESER Eingabe noch nicht vorkommt - sonst wuerde ein automatisch
  // vergebener Name mit einem getippten kollidieren und der Nutzer
  // bekaeme einen Fehler fuer etwas, das er gar nicht eingegeben hat.
  const resolved: string[] = [];
  for (let i = 0; i < typed.length; i++) {
    if (typed[i].length > 0) {
      resolved.push(typed[i]);
      continue;
    }
    let n = i + 1;
    const taken = (candidate: string) =>
      resolved.some((r) => isSameName(r, candidate)) || typed.some((t) => t.length > 0 && isSameName(t, candidate));
    while (taken(`Player ${n}`)) n++;
    resolved.push(`Player ${n}`);
  }

  // Getippte Namen werden NICHT still entschaerft: doppelte Eingaben
  // ergeben dieselbe Fehlermeldung wie im Profil-Dialog. Automatisch
  // umbenannt wird nur dort, wo niemand gefragt werden kann - bei der
  // Uebernahme von Gast-Daten in ein Konto (data/guestTakeover.ts).
  const checked: { id: string; name: string }[] = [];
  resolved.forEach((name, index) => {
    const valid = validateName(name);
    const clash = findNameConflict(valid, checked);
    if (clash) {
      throw new ProfileNameError(`You entered “${clash.name}” twice. Every player needs a different name.`);
    }
    checked.push({ id: String(index), name: valid });
  });

  // Ein Name, den es im Gast-Speicher schon gibt, wird wiederverwendet
  // statt doppelt angelegt - genau dafuer sind die zuletzt genutzten
  // Namen vorausgefuellt.
  return checked.map(({ name }) => {
    const pool = guestListProfiles(true, true);
    const match = pool.find((p) => isSameName(p.name, name));
    return match ?? guestCreateProfile({ name });
  });
}

// ---------------------------------------------------------------- Matches

export function guestMatches(): StoredMatch[] {
  return readJson<StoredMatch[]>(MATCHES_KEY, []);
}

export async function guestSaveMatch(
  matchId: string,
  gameId: string,
  settings: Record<string, unknown>,
  playerIds: string[],
  events: MatchEvent[],
  status: MatchStatus,
  winnerProfileId: string | null
): Promise<void> {
  const list = guestMatches();
  const existing = list.find((m) => m.id === matchId);
  const match: StoredMatch = {
    id: matchId,
    gameId,
    settings,
    configHash: await computeConfigHash(gameId, settings),
    playerIds,
    events,
    status,
    startedAt: existing?.startedAt ?? now(),
    finishedAt: status === "finished" ? now() : null,
    winnerProfileId,
  };
  writeJson(MATCHES_KEY, [...list.filter((m) => m.id !== matchId), match]);
}

export function guestSetStatus(matchId: string, status: MatchStatus, winnerProfileId: string | null): void {
  const list = guestMatches().map((m) =>
    m.id === matchId
      ? { ...m, status, finishedAt: status === "finished" || status === "abandoned" ? now() : null, winnerProfileId }
      : m
  );
  writeJson(MATCHES_KEY, list);
}

export function guestGetMatch(matchId: string): StoredMatch | null {
  return guestMatches().find((m) => m.id === matchId) ?? null;
}

export function guestFindInProgressMatch(): StoredMatch | null {
  return guestMatches().find((m) => m.status === "in_progress") ?? null;
}

// ---------------------------------------------------------------- Uebernahme

// Was beim Wechsel Gast -> Konto angeboten wird. Profile und Matches
// immer gemeinsam: Matches verweisen ueber die Profil-ID auf ihre
// Spieler, nur die Matches zu uebernehmen ergaebe eine Statistik mit
// unbekannten Namen.
export function guestDataSummary(): { profiles: number; matches: number } {
  return {
    profiles: guestListProfiles(true, true).length,
    matches: guestMatches().filter((m) => m.status === "finished").length,
  };
}

export function clearGuestData(): void {
  writeJson(PROFILES_KEY, []);
  writeJson(MATCHES_KEY, []);
}
