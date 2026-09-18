// Rein geraetelokale UI-Praeferenzen fuer den neuen Game Hub (Redesign
// 16.09.2026): Favoriten und "Zuletzt gespielt". Bewusst NICHT in
// Firestore/profilesDb, um keine neue Business-Logik/Datenmodell-
// Erweiterung einzufuehren (Fokus dieser Aenderung ist UI/Struktur) -
// beides ist rein kosmetisch/komfortbezogen und ueberlebt einen
// Browser-Wechsel bewusst nicht, aehnlich wie schon getStoredPiIp() in
// piConnection.ts.

const FAVORITES_KEY = "darts-favorite-games";
const RECENTLY_PLAYED_KEY = "darts-recently-played";
const RECENTLY_PLAYED_LIMIT = 6;

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
    // localStorage kann z.B. im privaten Fenster fehlschlagen - Favoriten/
    // Verlauf sind rein komfortbezogen, ein Fehlschlag hier darf das
    // Spielen selbst nicht beeintraechtigen.
  }
}

export function getFavoriteGameIds(): string[] {
  return readJson<string[]>(FAVORITES_KEY, []);
}

export function isFavoriteGame(gameId: string): boolean {
  return getFavoriteGameIds().includes(gameId);
}

export function toggleFavoriteGame(gameId: string): string[] {
  const current = getFavoriteGameIds();
  const next = current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId];
  writeJson(FAVORITES_KEY, next);
  return next;
}

export function getRecentlyPlayedGameIds(): string[] {
  return readJson<string[]>(RECENTLY_PLAYED_KEY, []);
}

// Vom Setup-Screen beim Start eines Matches aufgerufen - neueste zuerst,
// Duplikate entfernt, auf RECENTLY_PLAYED_LIMIT gedeckelt.
export function recordGamePlayed(gameId: string): void {
  const current = getRecentlyPlayedGameIds();
  const next = [gameId, ...current.filter((id) => id !== gameId)].slice(0, RECENTLY_PLAYED_LIMIT);
  writeJson(RECENTLY_PLAYED_KEY, next);
}

// Zuletzt genutztes Spielerprofil - rein geraetelokal (Tobias-Vorgabe
// 18.09.2026: KEIN Primaer-Profil, kein Flag am Profil selbst). Dient
// nur als Vorauswahl beim Spielstart und in der Kopfzeile.
const LAST_PROFILE_KEY = "darts-last-used-profile";

export function getLastUsedProfileId(): string | null {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
}

export function recordProfileUsed(profileId: string): void {
  try {
    localStorage.setItem(LAST_PROFILE_KEY, profileId);
  } catch {
    // Privates Fenster - dann eben ohne Vorauswahl.
  }
}

export function clearLastUsedProfile(): void {
  try {
    localStorage.removeItem(LAST_PROFILE_KEY);
  } catch {
    // siehe oben
  }
}
