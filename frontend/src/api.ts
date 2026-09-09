// Schmaler Client fuer die Backend-REST-API (docs/ARCHITEKTUR.md Abschnitt 10).
import { apiBaseFor, getStoredPiIp } from "./piConnection";

export type Profile = {
  id: string;
  name: string;
  initials: string | null;
  color: string | null;
  is_guest: number;
  merged_into_profile_id: string | null;
  archived_at: string | null;
  created_at: string;
};

export type SettingField = {
  key: string;
  label: string;
  type: "toggle" | "select" | "number";
  default: unknown;
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  presets?: number[];
  showIf?: { key: string; equals: unknown };
};

export type GameDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  engineFamily: string;
  playerRange: [number, number];
  implemented: boolean;
  durationModes: string[];
  settingsSchema: SettingField[];
  // Familienspezifische Zusatzfelder (nur bei manchen Spielen gesetzt) -
  // targets: feste Zielroute (target_progression, z.B. Bob's 27).
  // catchRange: [von, bis] der Zahlenfolge (catch, z.B. Catch 40).
  // dartsPerCheckout: an der GameDefinition fest vorgegeben statt als
  // Einstellung waehlbar (z.B. 60 +/-, siehe engine.py _visitsPerAttempt).
  targets?: string[];
  catchRange?: [number, number];
  dartsPerCheckout?: number;
};

export function defaultSettingsValues(schema: SettingField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of schema) values[field.key] = field.default;
  return values;
}

// Live-Zustand eines Matches, wie ihn MatchEngine.to_dict() liefert
// (backend/engine/engine.py). Kommt per WebSocket (useMatchState) und
// einmalig als REST-Antwort beim Anlegen.
export type MatchPlayer = {
  id: string;
  name: string;
  score: number | null;
  legsWon: number | null;
  setsWon: number | null;
  highestCheckout: number | null;
  highestLevel: number | null;
  runsCompleted: number | null;
  totalScore: number | null;
  bestRun: number | null;
  successfulCheckouts: number | null;
  attempts: number | null;
  successfulTargets: number | null;
  totalHits: number | null;
  totalDarts: number | null;
  singles: number | null;
  doubles: number | null;
  triples: number | null;
  perfectTargets: number | null;
  openNumbers: (number | string)[] | null;
  shanghaiCount: number | null;
  phaseScores: Record<string, number> | null;
};

export type MatchThrow = { throwSeq: number; label: string };

export type MatchVisit = { playerId: string; throws: MatchThrow[] };

export type MatchState = {
  matchId: string;
  gameId: string;
  gameName: string;
  engineFamily: string;
  settings: Record<string, unknown>;
  players: MatchPlayer[];
  activePlayerId: string;
  currentVisitThrows: MatchThrow[];
  target: string | null;
  phase: string | null;
  checkoutSuggestion: string[] | null;
  round: number;
  legNumber: number | null;
  setNumber: number | null;
  pendingConfirmation: boolean;
  pendingOutcome: "bust" | "checkout" | "target_done" | "continue" | null;
  history: MatchVisit[];
  canUndo: boolean;
  finished: boolean;
  winnerId: string | null;
  winnerName: string | null;
};

export type PendingResume = {
  matchId: string;
  gameId: string;
  gameName: string;
  playerNames: string[];
};

export type Segment = { number: number; multiplier: number };

// SPEC §5/§34/§35: dauerhafte Profil-Statistiken, ueber alle
// abgeschlossenen Matches hinweg berechnet (backend/persistence/stats.py).
export type ProfileGameStats = {
  gamesPlayed: number;
  wins: number;
  best: number | null;
  metricName: string | null;
  gameName: string;
};

export type ProfileHistoryEntry = {
  matchId: string;
  gameId: string;
  gameName: string;
  finishedAt: string;
  won: boolean;
  metricName: string | null;
  metricValue: number | null;
};

export type ProfileStats = {
  gamesPlayed: number;
  wins: number;
  winPercent: number | null;
  accuracy: number | null;
  singlePercent: number | null;
  doublePercent: number | null;
  triplePercent: number | null;
  bullPercent: number | null;
  checkoutPercent: number | null;
  averageCheckoutDarts: number | null;
  highestCheckout: number;
  scoringAverage: number | null;
  perGame: Record<string, ProfileGameStats>;
  history: ProfileHistoryEntry[];
};

export type LeaderboardEntry = { profileId: string; name: string; color: string | null; value: number };
export type Leaderboard = { configHash: string; configLabel: string; metricName: string; entries: LeaderboardEntry[] };

// Dev-Betrieb (Vite) und "vom Pi selbst ausgeliefert" (same-origin)
// brauchen keine gespeicherte IP - relative "/api"-Pfade reichen dann.
// Im Vercel-Deployment gibt es kein Backend am selben Origin, dort
// wird die vom Nutzer einmalig eingegebene Pi-IP verwendet (siehe
// ConnectScreen/piConnection.ts).
function apiBase(): string {
  const ip = getStoredPiIp();
  return ip ? apiBaseFor(ip) : "/api";
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`API-Fehler ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listProfiles(includeGuests = false): Promise<Profile[]> {
    const suffix = includeGuests ? "?include_guests=1" : "";
    return fetch(`${apiBase()}/profiles${suffix}`).then((res) => asJson<Profile[]>(res));
  },

  createProfile(data: { name: string; initials?: string; color?: string; is_guest?: boolean }): Promise<Profile> {
    return fetch(`${apiBase()}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((res) => asJson<Profile>(res));
  },

  updateProfile(id: string, data: { name?: string; initials?: string; color?: string }): Promise<Profile> {
    return fetch(`${apiBase()}/profiles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((res) => asJson<Profile>(res));
  },

  deleteProfile(id: string): Promise<{ ok: boolean }> {
    return fetch(`${apiBase()}/profiles/${id}`, { method: "DELETE" }).then((res) => asJson<{ ok: boolean }>(res));
  },

  listGames(): Promise<GameDefinition[]> {
    return fetch(`${apiBase()}/games`).then((res) => asJson<GameDefinition[]>(res));
  },

  getProfileStats(id: string): Promise<ProfileStats> {
    return fetch(`${apiBase()}/profiles/${id}/stats`).then((res) => asJson<ProfileStats>(res));
  },

  getGameLeaderboard(gameId: string): Promise<Leaderboard[]> {
    return fetch(`${apiBase()}/games/${gameId}/leaderboard`).then((res) => asJson<Leaderboard[]>(res));
  },

  createMatch(gameId: string, playerIds: string[], settings: Record<string, unknown>): Promise<{ matchId: string; state: MatchState }> {
    return fetch(`${apiBase()}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, playerIds, settings }),
    }).then((res) => asJson(res));
  },

  getActiveMatch(): Promise<MatchState | null> {
    return fetch(`${apiBase()}/matches/active`).then((res) => asJson(res));
  },

  confirmVisit(matchId: string): Promise<{ ok: boolean }> {
    return fetch(`${apiBase()}/matches/${matchId}/confirm`, { method: "POST" }).then((res) => asJson(res));
  },

  correctThrow(matchId: string, throwSeq: number, segment: Segment): Promise<{ ok: boolean }> {
    return fetch(`${apiBase()}/matches/${matchId}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ throwSeq, segment }),
    }).then((res) => asJson(res));
  },

  undoMatch(matchId: string): Promise<{ ok: boolean }> {
    return fetch(`${apiBase()}/matches/${matchId}/undo`, { method: "POST" }).then((res) => asJson(res));
  },

  addThrow(matchId: string, segment: Segment): Promise<{ ok: boolean }> {
    return fetch(`${apiBase()}/matches/${matchId}/add-throw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment }),
    }).then((res) => asJson(res));
  },

  getPendingResume(): Promise<PendingResume | null> {
    return fetch(`${apiBase()}/matches/pending-resume`).then((res) => asJson(res));
  },

  resumeMatch(matchId: string): Promise<MatchState> {
    return fetch(`${apiBase()}/matches/${matchId}/resume`, { method: "POST" }).then((res) => asJson(res));
  },

  abandonMatch(matchId: string): Promise<{ ok: boolean }> {
    return fetch(`${apiBase()}/matches/${matchId}/abandon`, { method: "POST" }).then((res) => asJson(res));
  },
};
