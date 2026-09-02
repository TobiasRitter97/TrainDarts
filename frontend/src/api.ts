// Schmaler Client fuer die Backend-REST-API (docs/ARCHITEKTUR.md Abschnitt 10).

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
  options?: { value: string; label: string }[];
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
  runsCompleted: number | null;
  totalScore: number | null;
  bestRun: number | null;
  successfulCheckouts: number | null;
  attempts: number | null;
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

const BASE = "/api";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`API-Fehler ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listProfiles(includeGuests = false): Promise<Profile[]> {
    const suffix = includeGuests ? "?include_guests=1" : "";
    return fetch(`${BASE}/profiles${suffix}`).then((res) => asJson<Profile[]>(res));
  },

  createProfile(data: { name: string; initials?: string; color?: string; is_guest?: boolean }): Promise<Profile> {
    return fetch(`${BASE}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((res) => asJson<Profile>(res));
  },

  updateProfile(id: string, data: { name?: string; initials?: string; color?: string }): Promise<Profile> {
    return fetch(`${BASE}/profiles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((res) => asJson<Profile>(res));
  },

  deleteProfile(id: string): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/profiles/${id}`, { method: "DELETE" }).then((res) => asJson<{ ok: boolean }>(res));
  },

  listGames(): Promise<GameDefinition[]> {
    return fetch(`${BASE}/games`).then((res) => asJson<GameDefinition[]>(res));
  },

  getBoardInfo(): Promise<{ boardHost: string; boardPort: number; calibrationUrl: string; hasControlApi: boolean }> {
    return fetch(`${BASE}/board/info`).then((res) => asJson(res));
  },

  startBoard(): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/board/start`, { method: "POST" }).then((res) => asJson(res));
  },

  stopBoard(): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/board/stop`, { method: "POST" }).then((res) => asJson(res));
  },

  resetBoard(): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/board/reset`, { method: "POST" }).then((res) => asJson(res));
  },

  createMatch(gameId: string, playerIds: string[], settings: Record<string, unknown>): Promise<{ matchId: string; state: MatchState }> {
    return fetch(`${BASE}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, playerIds, settings }),
    }).then((res) => asJson(res));
  },

  getActiveMatch(): Promise<MatchState | null> {
    return fetch(`${BASE}/matches/active`).then((res) => asJson(res));
  },

  confirmVisit(matchId: string): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/matches/${matchId}/confirm`, { method: "POST" }).then((res) => asJson(res));
  },

  correctThrow(matchId: string, throwSeq: number, segment: Segment): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/matches/${matchId}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ throwSeq, segment }),
    }).then((res) => asJson(res));
  },

  undoMatch(matchId: string): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/matches/${matchId}/undo`, { method: "POST" }).then((res) => asJson(res));
  },

  addThrow(matchId: string, segment: Segment): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/matches/${matchId}/add-throw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment }),
    }).then((res) => asJson(res));
  },

  getPendingResume(): Promise<PendingResume | null> {
    return fetch(`${BASE}/matches/pending-resume`).then((res) => asJson(res));
  },

  resumeMatch(matchId: string): Promise<MatchState> {
    return fetch(`${BASE}/matches/${matchId}/resume`, { method: "POST" }).then((res) => asJson(res));
  },

  abandonMatch(matchId: string): Promise<{ ok: boolean }> {
    return fetch(`${BASE}/matches/${matchId}/abandon`, { method: "POST" }).then((res) => asJson(res));
  },
};
