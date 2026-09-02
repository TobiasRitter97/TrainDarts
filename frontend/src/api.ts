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
};
