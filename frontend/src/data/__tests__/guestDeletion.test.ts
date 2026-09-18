import { beforeEach, describe, expect, it } from "vitest";

// vitest laeuft ohne DOM, der Gast-Speicher braucht aber localStorage.
// Ein minimaler Ersatz genuegt - er muss nur merken, was geschrieben
// wurde.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

const storage = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;

const guest = await import("../guestStore");
const { ProfileNameError } = await import("../profileNames");

function addMatch(playerIds: string[], status: "finished" | "in_progress") {
  const all = JSON.parse(storage.getItem("darts-guest-matches") ?? "[]");
  all.push({
    id: `m${all.length}`,
    gameId: "170",
    settings: {},
    configHash: "x",
    playerIds,
    events: [],
    status,
    startedAt: "2026-09-18T10:00:00.000Z",
    finishedAt: status === "finished" ? "2026-09-18T10:30:00.000Z" : null,
    winnerProfileId: null,
  });
  storage.setItem("darts-guest-matches", JSON.stringify(all));
}

const matchCount = () => JSON.parse(storage.getItem("darts-guest-matches") ?? "[]").length;

describe("Profil loeschen (Gast-Speicher)", () => {
  beforeEach(() => storage.clear());

  it("loescht das Profil und seine ALLEINIGEN Spiele", () => {
    const tobias = guest.guestCreateProfile({ name: "Tobias" });
    guest.guestCreateProfile({ name: "Lisa" });
    addMatch([tobias.id], "finished");
    addMatch([tobias.id], "finished");

    expect(guest.guestDeletionInfo(tobias.id)).toMatchObject({ ownGames: 2, sharedGames: 0, blockedReason: null });
    guest.guestDeleteProfile(tobias.id);

    expect(guest.guestListProfiles(true, true).map((p) => p.name)).toEqual(["Lisa"]);
    expect(matchCount()).toBe(0);
  });

  it("laesst Spiele mit weiteren Mitspielern unangetastet", () => {
    const tobias = guest.guestCreateProfile({ name: "Tobias" });
    const lisa = guest.guestCreateProfile({ name: "Lisa" });
    addMatch([tobias.id], "finished");
    addMatch([tobias.id, lisa.id], "finished");

    expect(guest.guestDeletionInfo(tobias.id)).toMatchObject({ ownGames: 1, sharedGames: 1 });
    guest.guestDeleteProfile(tobias.id);

    // Das gemeinsame Spiel gehoert auch Lisa - es bleibt.
    expect(matchCount()).toBe(1);
    expect(JSON.parse(storage.getItem("darts-guest-matches")!)[0].playerIds).toEqual([tobias.id, lisa.id]);
  });

  it("verweigert das letzte verbleibende Profil", () => {
    const only = guest.guestCreateProfile({ name: "Tobias" });
    expect(guest.guestDeletionInfo(only.id).blockedReason).toBe(
      "This is your last profile. Create another one before deleting it."
    );
    expect(() => guest.guestDeleteProfile(only.id)).toThrow(ProfileNameError);
    expect(guest.guestListProfiles(true, true)).toHaveLength(1);
  });

  it("verweigert ein Profil aus einem unfertigen Spiel und nennt den Namen", () => {
    const lisa = guest.guestCreateProfile({ name: "Lisa" });
    guest.guestCreateProfile({ name: "Tobias" });
    addMatch([lisa.id], "in_progress");

    expect(guest.guestDeletionInfo(lisa.id).blockedReason).toBe(
      "'Lisa' is part of an unfinished game. Finish or discard it first."
    );
    expect(() => guest.guestDeleteProfile(lisa.id)).toThrow(/unfinished game/);
    expect(guest.guestListProfiles(true, true)).toHaveLength(2);
  });

  it("raeumt die geraetelokale Vorauswahl auf, wenn sie auf das geloeschte Profil zeigt", () => {
    const tobias = guest.guestCreateProfile({ name: "Tobias" });
    guest.guestCreateProfile({ name: "Lisa" });
    storage.setItem("darts-last-used-profile", tobias.id);

    guest.guestDeleteProfile(tobias.id);
    expect(storage.getItem("darts-last-used-profile")).toBeNull();
  });

  it("laesst die Vorauswahl in Ruhe, wenn sie auf ein anderes Profil zeigt", () => {
    const tobias = guest.guestCreateProfile({ name: "Tobias" });
    const lisa = guest.guestCreateProfile({ name: "Lisa" });
    storage.setItem("darts-last-used-profile", lisa.id);

    guest.guestDeleteProfile(tobias.id);
    expect(storage.getItem("darts-last-used-profile")).toBe(lisa.id);
  });

  it("unterscheidet Loeschen von Deaktivieren - deaktiviert bleibt alles erhalten", () => {
    const tobias = guest.guestCreateProfile({ name: "Tobias" });
    guest.guestCreateProfile({ name: "Lisa" });
    addMatch([tobias.id], "finished");

    guest.guestArchiveProfile(tobias.id);
    expect(guest.guestListProfiles(true, false).map((p) => p.name)).toEqual(["Lisa"]);
    expect(guest.guestListProfiles(true, true)).toHaveLength(2);
    expect(matchCount()).toBe(1);
  });
});
