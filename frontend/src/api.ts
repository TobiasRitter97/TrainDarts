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
};
