import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_COLLECTION, PROFILE_OWNED_COLLECTIONS } from "../profiles";

const DATA_DIR = join(__dirname, "..");

function dataSources(): { file: string; text: string }[] {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: f, text: readFileSync(join(DATA_DIR, f), "utf8") }));
}

describe("Loesch-Registry", () => {
  // Der Waechter aus Tobias' Vorgabe: kommt irgendwann eine Sammlung
  // unter users/{uid} dazu, deren Dokumente einem Profil zugeordnet
  // sind, muss sie in PROFILE_OWNED_COLLECTIONS stehen - sonst
  // ueberlebt sie das Loeschen und es bleiben Karteileichen zurueck.
  it("kennt jede Sammlung unter users/{uid}, die im Code benutzt wird", () => {
    const found = new Set<string>();
    for (const { text } of dataSources()) {
      for (const m of text.matchAll(/collection\(\s*db\s*,\s*"users"\s*,\s*[^,]+,\s*"([^"]+)"/g)) {
        found.add(m[1]);
      }
    }
    // Die Profil-Sammlung selbst gehoert nicht in die Liste: dort liegt
    // das Profildokument, das separat geloescht wird.
    found.delete(PROFILE_COLLECTION);

    const registered = new Set<string>(PROFILE_OWNED_COLLECTIONS.map((c) => c.collection));
    const missing = [...found].filter((name) => !registered.has(name));

    expect(
      missing,
      `Diese Sammlung(en) sind einem Profil zugeordnet, stehen aber nicht in PROFILE_OWNED_COLLECTIONS: ` +
        `${missing.join(", ")}. Ohne Eintrag bleiben ihre Dokumente beim Loeschen eines Profils zurueck.`
    ).toEqual([]);
  });

  it("nennt fuer jede Sammlung das Feld, ueber das die Zuordnung laeuft", () => {
    for (const entry of PROFILE_OWNED_COLLECTIONS) {
      expect(entry.collection.length).toBeGreaterThan(0);
      expect(entry.arrayField.length).toBeGreaterThan(0);
    }
  });

  it("fuehrt die Match-Sammlung, weil Matches ueber playerIds auf Profile zeigen", () => {
    const matches = PROFILE_OWNED_COLLECTIONS.find((c) => c.collection === "matches");
    expect(matches, "matches fehlt in PROFILE_OWNED_COLLECTIONS").toBeDefined();
    expect(matches?.arrayField).toBe("playerIds");
  });
});

describe("Loesch-Registry – Gegenprobe des Waechters", () => {
  // Beweist, dass der Test oben wirklich anschlaegt: dieselbe Logik auf
  // einem erfundenen Quelltext mit einer nicht registrierten Sammlung.
  it("meldet eine fehlende Sammlung namentlich", () => {
    const fakeSource = 'const ref = collection(db, "users", currentUid(), "achievements");';
    const found = new Set<string>();
    for (const m of fakeSource.matchAll(/collection\(\s*db\s*,\s*"users"\s*,\s*[^,]+,\s*"([^"]+)"/g)) {
      found.add(m[1]);
    }
    found.delete(PROFILE_COLLECTION);
    const registered = new Set<string>(PROFILE_OWNED_COLLECTIONS.map((c) => c.collection));
    const missing = [...found].filter((name) => !registered.has(name));
    expect(missing).toEqual(["achievements"]);
  });
});
