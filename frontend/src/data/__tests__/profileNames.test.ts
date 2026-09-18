import { describe, expect, it } from "vitest";
import {
  assertNameFree,
  displayName,
  findNameConflict,
  isSameName,
  makeNameUnique,
  NAME_MAX,
  NAME_MIN,
  normalizeName,
  ProfileNameError,
  validateName,
} from "../profileNames";

const p = (id: string, name: string) => ({ id, name });

describe("profileNames – Normalisierung", () => {
  it("vergleicht ohne Rand-Leerraum, ohne Mehrfach-Leerzeichen und ohne Gross-/Kleinschreibung", () => {
    expect(normalizeName("  Tobias   R  ")).toBe("tobias r");
    expect(normalizeName("TOBIAS R")).toBe(normalizeName("tobias  r"));
  });

  it("speichert den Namen so, wie getippt - nur aussen gekuerzt", () => {
    expect(displayName("  Tobias  R  ")).toBe("Tobias  R");
  });
});

describe("profileNames – Validierung", () => {
  it("nimmt uebliche Namen an, inklusive Umlauten und Zeichen aus dem erlaubten Satz", () => {
    for (const name of ["Jo", "Tobias", "Björn-Ole", "O'Connor", "Player 1", "Anna_M.", "Tom (2)"]) {
      expect(validateName(name)).toBe(name);
    }
  });

  it("kuerzt Leerraum am Rand, statt ihn abzulehnen", () => {
    expect(validateName("  Tobias  ")).toBe("Tobias");
  });

  it("lehnt zu kurz, zu lang und leer ab", () => {
    expect(() => validateName("")).toThrow(ProfileNameError);
    expect(() => validateName("   ")).toThrow(ProfileNameError);
    expect(() => validateName("A")).toThrow(ProfileNameError);
    expect(validateName("A".repeat(NAME_MAX))).toHaveLength(NAME_MAX);
    expect(() => validateName("A".repeat(NAME_MAX + 1))).toThrow(ProfileNameError);
    expect(validateName("A".repeat(NAME_MIN))).toHaveLength(NAME_MIN);
  });

  it("lehnt unerlaubte Zeichen ab", () => {
    for (const name of ["Tom<script>", "a/b", "hey@you", "emoji 🎯"]) {
      expect(() => validateName(name)).toThrow(ProfileNameError);
    }
  });
});

describe("profileNames – Eindeutigkeit", () => {
  const existing = [p("1", "Tobias"), p("2", "Lisa")];

  it("erkennt einen belegten Namen unabhaengig von Schreibweise und Leerraum", () => {
    expect(findNameConflict("tobias", existing)?.id).toBe("1");
    expect(findNameConflict("  TOBIAS  ", existing)?.id).toBe("1");
    expect(findNameConflict("Tobi", existing)).toBeNull();
  });

  it("laesst das eigene Profil aus - Umbenennen auf den eigenen Namen muss gehen", () => {
    expect(findNameConflict("Tobias", existing, "1")).toBeNull();
    expect(() => assertNameFree("Tobias", existing, "1")).not.toThrow();
    expect(() => assertNameFree("Tobias", existing, "2")).toThrow(ProfileNameError);
  });

  it("erkennt den unveraenderten Namen - darueber laeuft die Ausnahme fuer Altbestand", () => {
    // Bestandsdaten duerfen doppelte Namen haben, sie werden nicht
    // angefasst. Ein unveraendertes Speichern darf deshalb nie an der
    // Eindeutigkeit scheitern. Der Schreibpfad prueft dafuer zuerst
    // isSameName() und ueberspringt die Kollisionspruefung ganz.
    const doubled = [p("1", "Tom"), p("2", "Tom")];
    expect(isSameName("Tom", "Tom")).toBe(true);
    expect(isSameName("  tom ", "Tom")).toBe(true);
    expect(isSameName("Tom", "Tomas")).toBe(false);
    // Nur wenn der Name WIRKLICH wechselt, greift die Pruefung:
    expect(() => assertNameFree("Tom", doubled, "1")).toThrow(ProfileNameError);
    expect(findNameConflict("Tom", doubled, "1")?.id).toBe("2");
  });
});

describe("profileNames – Konfliktaufloesung fuer die Gast-Uebernahme", () => {
  it("laesst einen freien Namen unveraendert", () => {
    expect(makeNameUnique("Lisa", [p("1", "Tobias")])).toBe("Lisa");
  });

  it("haengt eine Zahl an, bis der Name frei ist", () => {
    const taken = [p("1", "Tobias")];
    expect(makeNameUnique("Tobias", taken)).toBe("Tobias (2)");
    expect(makeNameUnique("Tobias", [...taken, p("2", "Tobias (2)")])).toBe("Tobias (3)");
  });

  it("haelt die Laengengrenze ein, indem es die Basis kuerzt", () => {
    const long = "A".repeat(NAME_MAX);
    const unique = makeNameUnique(long, [p("1", long)]);
    expect(unique.length).toBeLessThanOrEqual(NAME_MAX);
    expect(unique.endsWith(" (2)")).toBe(true);
  });

  it("erzeugt einen Namen, der die Validierung besteht", () => {
    const unique = makeNameUnique("Tobias", [p("1", "Tobias")]);
    expect(() => validateName(unique)).not.toThrow();
  });
});
