// Tests fuer die in Phase D des Client-Rewrites ergaenzten 6
// Spielfamilien (~/.claude/plans/agile-brewing-wadler.md). Es gibt kein
// Python-Aequivalent (das Original hatte keine Engine-Tests), daher
// neu geschrieben statt portiert. Schwerpunkt: die TASK_BASED_FAMILIES-
// Rundenwechsel-Logik (checkout_range/random_checkout/catch), da diese
// laut Python-Kommentaren historisch die fehleranfaelligste Stelle war
// (3 Korrekturen) - hier wird gezielt geprueft, dass der Spieler nach
// JEDER Aufnahme wechselt, waehrend der Versuchs-Fortschritt getrennt
// weiterlaeuft.
import { describe, expect, it } from "vitest";
import { GameDefinition } from "../../api";
import { MatchEngine, MatchPlayerRef } from "../matchEngine";
import { Segment } from "../scoring";

function seg(label: string): Segment {
  const upper = label.toUpperCase();
  if (upper === "BULL") return { number: 25, multiplier: 2 };
  const prefix = upper[0];
  const number = parseInt(upper.slice(1), 10);
  const multiplier = ({ S: 1, D: 2, T: 3 } as Record<string, number>)[prefix];
  return { number, multiplier };
}

function throwDarts(engine: MatchEngine, labels: string[]): void {
  for (const label of labels) engine.handleThrow(label, { segment: seg(label) });
}

function throwAndConfirm(engine: MatchEngine, labels: string[]): void {
  throwDarts(engine, labels);
  engine.confirmVisit();
}

const PLAYERS: MatchPlayerRef[] = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
];

describe("checkout_range (121) - task rotation", () => {
  const GAME: GameDefinition = {
    id: "121",
    name: "121",
    description: "",
    category: "CHECKOUT",
    icon: "🔢",
    engineFamily: "checkout_range",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["endless"],
    settingsSchema: [],
  };

  it("switches player after every visit, resolves attempt only when a player's own visits are used up", () => {
    const engine = new MatchEngine("m1", GAME, PLAYERS, {
      startLevel: 40,
      onSuccessDelta: 5,
      onFailDelta: -1,
      safehouseMode: "off",
      checkoutMode: "double_out",
      gameLengthMode: "endless",
      dartsPerCheckout: 6, // 2 eigene Aufnahmen pro Versuch
    });

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // p1 visit 1: 40 -> 37, continue
    expect(engine.toDict().activePlayerId).toBe("p2"); // Spieler wechselt sofort

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // p2 visit 1: 40 -> 37, continue
    expect(engine.toDict().activePlayerId).toBe("p1");

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // p1 visit 2 (letzte eigene): 37 -> 34, Versuch erschoepft ohne Checkout
    let state = engine.toDict();
    expect(state.activePlayerId).toBe("p2"); // trotzdem Spielerwechsel
    expect(state.players[0].attempts).toBe(1);
    expect(state.players[0].highestLevel).toBe(40); // kein Checkout, level unveraendert (floor auf Start)

    throwAndConfirm(engine, ["T7", "D8"]); // p2 visit 2: 37 - 21 - 16 = 0, gueltiger Checkout
    state = engine.toDict();
    expect(state.players[1].successfulCheckouts).toBe(1);
    expect(state.players[1].highestLevel).toBe(40); // erreichtes Level war 40 (nicht das neue Ziel)

    // Beide Spieler haben ihren Teil des Versuchs jetzt abgeschlossen -
    // neuer gemeinsamer Versuch beginnt, p1 (Verlierer des Vorversuchs)
    // startet wieder bei 40, p2 (Checkout) hat ein neues Ziel bei 45.
    expect(state.activePlayerId).toBe("p1");
  });
});

describe("random_checkout - shared target", () => {
  const GAME: GameDefinition = {
    id: "random_checkout",
    name: "Random Checkout",
    description: "",
    category: "CHECKOUT",
    icon: "🎲",
    engineFamily: "random_checkout",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["count"],
    settingsSchema: [],
  };

  it("both players attempt the same shared random target", () => {
    const engine = new MatchEngine("m2", GAME, PLAYERS, {
      minCheckout: 40,
      maxCheckout: 40, // deterministisch fuer den Test
      numberOfCheckouts: 2,
      dartsPerCheckout: 3,
    });
    const state = engine.toDict();
    expect(state.players[0].score).toBe(40);
    expect(state.players[1].score).toBe(40);
    expect(state.target).toBe("40");
  });

  it("moves to the next shared round once every player is done", () => {
    const engine = new MatchEngine("m3", GAME, PLAYERS, {
      minCheckout: 40,
      maxCheckout: 40,
      numberOfCheckouts: 2,
      dartsPerCheckout: 3, // genau 1 eigene Aufnahme pro Versuch
    });
    throwAndConfirm(engine, ["D20"]); // p1 checkt sofort aus
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // p2 verpasst (einziger Versuch verbraucht)
    const state = engine.toDict();
    expect(state.players[0].successfulCheckouts).toBe(1);
    expect(state.players[1].attempts).toBe(1);
    expect(state.players[1].successfulCheckouts).toBe(0);
    // Neuer Versuch fuer beide (numberOfCheckouts=2, noch nicht fertig)
    expect(state.finished).toBe(false);
  });
});

describe("catch - always advances regardless of outcome", () => {
  const GAME: GameDefinition = {
    id: "catch40_easy",
    name: "Catch 40 Easy",
    description: "",
    category: "CHECKOUT",
    icon: "🎯",
    engineFamily: "catch",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["targets"],
    catchRange: [41, 43],
    settingsSchema: [],
  };

  it("moves to the next number even after a missed attempt", () => {
    const engine = new MatchEngine("m4", GAME, [{ id: "solo", name: "Solo" }], {
      gameLengthMode: "full",
      shuffle: false,
    });
    expect(engine.toDict().target).toBe("41");
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // 41 -> 38, kein Checkout, 1 von 2 Aufnahmen
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // 38 -> 35, Versuch erschoepft
    const state = engine.toDict();
    expect(state.players[0].attempts).toBe(1);
    expect(state.players[0].successfulCheckouts).toBe(0);
    expect(state.target).toBe("42"); // IMMER weiter, kein Stehenbleiben
  });
});

describe("target_progression (Bob's 27)", () => {
  const GAME: GameDefinition = {
    id: "bobs27",
    name: "Bob's 27",
    description: "",
    category: "DOUBLES",
    icon: "🎯",
    engineFamily: "target_progression",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["runs"],
    targets: ["D1", "D2", "BULL"],
    settingsSchema: [],
  };

  it("adds points on a hit and subtracts on a full miss, then always advances", () => {
    const engine = new MatchEngine("m5", GAME, [{ id: "solo", name: "Solo" }], { mode: "single" });
    expect(engine.toDict().target).toBe("D1");
    throwAndConfirm(engine, ["D1", "S5", "S5"]); // 1 Treffer auf D1 -> +2
    let state = engine.toDict();
    expect(state.players[0].score).toBe(29);
    expect(state.target).toBe("D2");

    throwAndConfirm(engine, ["S5", "S5", "S5"]); // komplett verfehlt -> -4
    state = engine.toDict();
    expect(state.players[0].score).toBe(25);
    expect(state.target).toBe("BULL");
  });
});

describe("accuracy_progression (Around the World)", () => {
  it("hops to the next open number mid-visit at requiredHits=1 and ends the match immediately when the list empties", () => {
    const GAME: GameDefinition = {
      id: "around_the_world",
      name: "Around the World",
      description: "",
      category: "ACCURACY",
      icon: "🌍",
      engineFamily: "accuracy_progression",
      playerRange: [1, 4],
      implemented: true,
      durationModes: ["race"],
      settingsSchema: [],
    };
    // Nur 2 offene Zahlen simulieren wir durch requiredHits/segmentMode
    // Standardwerte und pruefen die ersten beiden Ziele (1, 2).
    const engine = new MatchEngine("m6", GAME, [{ id: "solo", name: "Solo" }], {
      segmentMode: "single",
      requiredHits: 1,
      includeBull: false,
    });
    expect(engine.toDict().target).toBe("1");
    // Ein Dart trifft Ziel 1 (Single) -> springt INNERHALB derselben
    // Aufnahme sofort zu Ziel 2 fuer den naechsten Dart.
    engine.handleThrow("S1", { segment: seg("S1") });
    expect(engine.toDict().target).toBe("2");
  });

  const GAME_RH2: GameDefinition = {
    id: "around_the_world",
    name: "Around the World",
    description: "",
    category: "ACCURACY",
    icon: "🌍",
    engineFamily: "accuracy_progression",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["race"],
    settingsSchema: [],
  };

  it("targetChangeMode 'per_visit' (Standard): stays on the same number for all 3 darts even after the requirement is already met", () => {
    const engine = new MatchEngine("m6b", GAME_RH2, [{ id: "solo", name: "Solo" }], {
      segmentMode: "single",
      requiredHits: 2,
      targetChangeMode: "per_visit",
    });
    engine.handleThrow("S1", { segment: seg("S1") });
    engine.handleThrow("S1", { segment: seg("S1") }); // 2 Treffer erreicht, bleibt trotzdem auf "1"
    expect(engine.toDict().target).toBe("1");
    engine.handleThrow("S1", { segment: seg("S1") });
    engine.confirmVisit(); // erst nach Bestaetigung der Aufnahme wechselt das Ziel
    expect(engine.toDict().target).toBe("2");
  });

  it("targetChangeMode 'per_dart' (Tobias-Feedback 09.09.2026): switches mid-visit as soon as the hit requirement is met", () => {
    const engine = new MatchEngine("m6c", GAME_RH2, [{ id: "solo", name: "Solo" }], {
      segmentMode: "single",
      requiredHits: 2,
      targetChangeMode: "per_dart",
    });
    engine.handleThrow("S1", { segment: seg("S1") });
    engine.handleThrow("S1", { segment: seg("S1") }); // 2 Treffer erreicht -> sofort weiter zu "2"
    expect(engine.toDict().target).toBe("2");
  });
});

describe("jdc (JDC Challenge)", () => {
  const GAME: GameDefinition = {
    id: "jdc",
    name: "JDC Challenge",
    description: "",
    category: "ACCURACY",
    icon: "🏆",
    engineFamily: "jdc",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["runs"],
    settingsSchema: [],
  };

  it("scores a Shanghai bonus and transitions to the doubles phase", () => {
    const engine = new MatchEngine("m7", GAME, [{ id: "solo", name: "Solo" }], { mode: "single" });
    expect(engine.toDict().target).toBe("10");
    expect(engine.toDict().phase).toBe("Shanghai 10–15");
    throwAndConfirm(engine, ["S10", "D10", "T10"]); // Shanghai auf die 10: 10+20+30+100=160
    const state = engine.toDict();
    expect(state.players[0].score).toBe(160); // COUNTDOWN_FIELD=runScore
    expect(state.players[0].shanghaiCount).toBe(1);
    expect(state.target).toBe("11");
  });

  it("advances the doubles target on every dart regardless of hit or miss", () => {
    const engine = new MatchEngine("m8", GAME, [{ id: "solo", name: "Solo" }], { mode: "single" });
    // Phase 1 (Shanghai 10-15) mit 6 Nummern schnell durchlaufen (immer verfehlen).
    for (let i = 0; i < 6; i++) throwAndConfirm(engine, ["S1", "S1", "S1"]);
    expect(engine.toDict().phase).toBe("Doubles 1–20 + Bull");
    expect(engine.toDict().target).toBe("D1");
    engine.handleThrow("S1", { segment: seg("S1") }); // Fehlwurf auf D1
    expect(engine.toDict().target).toBe("D2"); // trotzdem weiter zum naechsten Doppel
  });
});
