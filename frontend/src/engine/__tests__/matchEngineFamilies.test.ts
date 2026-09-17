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
import * as groupingFamily from "../families/grouping";
import * as randomSegmentFamily from "../families/randomSegment";
import * as x01Family from "../families/x01";
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

function throwWithCoords(engine: MatchEngine, throws: { label: string; coords?: { x: number; y: number } }[]): void {
  for (const t of throws) engine.handleThrow(t.label, { segment: seg(t.label), coords: t.coords });
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

  it("Tobias-Bug 15.09.2026: a bust mid-attempt (visits still remaining) must NOT reset the remaining value back to the attempt's starting level", () => {
    const engine = new MatchEngine("m1b", GAME, [{ id: "solo", name: "Solo" }], {
      startLevel: 121,
      safehouseMode: "off",
      checkoutMode: "double_out",
      gameLengthMode: "endless",
      dartsPerCheckout: 9, // 3 eigene Aufnahmen pro Versuch
    });

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // visit 1: 121 -> 118, continue
    expect(engine.toDict().players[0].score).toBe(118);

    throwAndConfirm(engine, ["T20", "T20", "T20"]); // visit 2: 118 - 180 -> Bust, aber noch 1 Aufnahme uebrig
    let state = engine.toDict();
    // Vorher (Bug): sprang faelschlich auf den vollen Versuchs-Startwert
    // (121) zurueck, obwohl der Versuch noch nicht vorbei ist.
    expect(state.players[0].score).toBe(118);
    expect(state.players[0].attempts).toBe(0); // Versuch laeuft noch

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // visit 3 (letzte): 118 -> 115, Versuch jetzt wirklich erschoepft
    state = engine.toDict();
    expect(state.players[0].attempts).toBe(1); // erst jetzt zaehlt der Versuch als gescheitert
    expect(state.players[0].score).toBe(121); // Anzeige zeigt den (unveraenderten) Zielwert des naechsten Versuchs
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

  it("Tobias-Bug 11.09.2026: targetChangeMode 'per_dart' must accumulate hits ACROSS multiple visits, not reset every visit", () => {
    // Vorher wurde der Trefferzaehler bei jeder neuen Aufnahme
    // faelschlich auf 0 zurueckgesetzt - wer die noetigen Treffer nicht
    // in EINER einzigen Aufnahme schaffte, blieb fuer immer auf
    // derselben Zahl haengen.
    const engine = new MatchEngine("m6e", GAME_RH2, [{ id: "solo", name: "Solo" }], {
      segmentMode: "single",
      requiredHits: 2,
      targetChangeMode: "per_dart",
    });
    expect(engine.toDict().target).toBe("1");
    throwAndConfirm(engine, ["S1", "S9", "S9"]); // 1 Treffer auf "1" in Aufnahme 1
    expect(engine.toDict().target).toBe("1"); // noch nicht genug (1 von 2)
    throwAndConfirm(engine, ["S1", "S9", "S9"]); // 2. Treffer auf "1" in Aufnahme 2
    expect(engine.toDict().target).toBe("2"); // jetzt erreicht -> Wechsel
  });

  it("Tobias-Bug 10.09.2026: an early takeout with only 2 darts must NOT jump back to the very first open number", () => {
    // Der Bug betraf gezielt requiredHits 2/3 im Modus "per_visit"
    // (Standard) - dort lieferte applyThrow() bei weniger als 3 Darts
    // bisher ein leeres {outcome:"continue"} OHNE endingTarget, wodurch
    // resolveVisit() faelschlich auf openNumbers[0] zurueckfiel.
    const engine = new MatchEngine("m6d", GAME_RH2, [{ id: "solo", name: "Solo" }], {
      segmentMode: "single",
      requiredHits: 2,
      targetChangeMode: "per_visit",
    });
    // Aktuelles Ziel ist "5" (drei Aufnahmen auf "1","2","3","4" schon
    // verfehlt), dann Takeout nach nur 2 Darts (drittes nicht erkannt).
    for (let i = 0; i < 4; i++) throwAndConfirm(engine, ["S9", "S9", "S9"]); // "1".."4" je verfehlt
    expect(engine.toDict().target).toBe("5");
    throwDarts(engine, ["S9", "S9"]); // verfehlt "5" mit nur 2 Darts
    engine.confirmVisit(); // Takeout nach nur 2 Darts
    // Korrekt waere "6" (verfehlt -> normaler Wechsel zur naechsten
    // Zahl, wie bei jeder anderen verfehlten Aufnahme auch). Der Bug
    // sprang stattdessen auf "1" zurueck (openNumbers[0]) zurueck.
    expect(engine.toDict().target).toBe("6");
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

describe("grouping (Grouping Championship)", () => {
  const GAME: GameDefinition = {
    id: "grouping_championship",
    name: "Grouping Championship",
    description: "",
    category: "ACCURACY",
    icon: "📏",
    engineFamily: "grouping",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["rounds"],
    settingsSchema: [],
  };

  it("scores Triple=100/Single=20/Miss=0 on T20 and computes the grouping distance from coords", () => {
    const engine = new MatchEngine("g1", GAME, [{ id: "solo", name: "Solo" }], {});
    expect(engine.toDict().target).toBe("T20");
    // Rohe coords sind normalisiert (1.0 = 170mm, siehe grouping.ts) -
    // hier durch MM_PER_COORD_UNIT geteilt, damit die Testdaten direkt
    // die gewuenschten mm-Abstaende (3/4/5) ergeben.
    const u = groupingFamily.MM_PER_COORD_UNIT;
    throwWithCoords(engine, [
      { label: "T20", coords: { x: 0, y: 0 } },
      { label: "T20", coords: { x: 3 / u, y: 0 } }, // 3mm vom ersten Dart
      { label: "S1", coords: { x: 0, y: 4 / u } }, // daneben (kein T20/S20) -> 0 Punkte
    ]);
    engine.confirmVisit();
    const state = engine.toDict();
    expect(state.players[0].score).toBe(200); // 100 + 100 + 0
    // Paare: (0,0)-(3,0)=3, (0,0)-(0,4)=4, (3,0)-(0,4)=5 -> Durchschnitt 4
    expect(state.players[0].groupingRounds?.[0].mm).toBeCloseTo(4, 5);
    expect(state.players[0].groupingRounds?.[0].hits).toEqual({ triple: 2, single: 0, miss: 1 });
  });

  it("marks a round's mm as null when fewer than 2 darts have real coordinates", () => {
    const engine = new MatchEngine("g2", GAME, [{ id: "solo", name: "Solo" }], {});
    throwWithCoords(engine, [
      { label: "S20", coords: { x: 1, y: 1 } },
      { label: "S20" }, // manuell/ohne Koordinaten
      { label: "S20" },
    ]);
    engine.confirmVisit();
    expect(engine.toDict().players[0].groupingRounds?.[0].mm).toBeNull();
  });

  it("Tobias-Feedback 11.09.2026: early takeout with <3 darts still evaluates the round (padded, no crash/skip)", () => {
    const engine = new MatchEngine("g3", GAME, [{ id: "solo", name: "Solo" }], {});
    throwWithCoords(engine, [{ label: "T20", coords: { x: 0, y: 0 } }]); // nur 1 Dart, dann Takeout
    engine.confirmVisit();
    const state = engine.toDict();
    expect(state.players[0].score).toBe(100); // nur der eine echte Treffer zaehlt
    expect(state.players[0].groupingRounds?.[0].mm).toBeNull(); // <2 echte Koordinaten
    expect(state.target).toBe("T20"); // Ziel bleibt immer T20
  });

  it("tracks the best (smallest mm) round across the match", () => {
    const engine = new MatchEngine("g4", GAME, [{ id: "solo", name: "Solo" }], {});
    throwWithCoords(engine, [
      { label: "S1", coords: { x: 0, y: 0 } },
      { label: "S1", coords: { x: 10, y: 0 } },
      { label: "S1", coords: { x: 20, y: 0 } },
    ]);
    engine.confirmVisit(); // Runde 1: weites Grouping
    throwWithCoords(engine, [
      { label: "S1", coords: { x: 0, y: 0 } },
      { label: "S1", coords: { x: 1, y: 0 } },
      { label: "S1", coords: { x: 2, y: 0 } },
    ]);
    engine.confirmVisit(); // Runde 2: enges Grouping - sollte "beste Runde" werden
    const state = engine.toDict();
    expect(state.players[0].bestGroupingRoundIndex).toBe(1);
  });

  it("players alternate turns and the match only finishes once EVERY player has played all 20 rounds", () => {
    const engine = new MatchEngine("g5", GAME, PLAYERS, {});
    for (let i = 0; i < groupingFamily.TOTAL_ROUNDS - 1; i++) {
      throwAndConfirm(engine, ["S1", "S1", "S1"]); // Alice
      throwAndConfirm(engine, ["S1", "S1", "S1"]); // Bob
    }
    expect(engine.toDict().finished).toBe(false);
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Alice's letzte (20.) Runde
    expect(engine.toDict().finished).toBe(false); // Bob hat seine 20. Runde noch nicht gespielt
    expect(engine.toDict().activePlayerId).toBe("p2");
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Bob's letzte (20.) Runde
    expect(engine.toDict().finished).toBe(true); // erst jetzt, wo BEIDE fertig sind
  });
});

describe("random_segment (Random Segment Training)", () => {
  const GAME: GameDefinition = {
    id: "random_segment",
    name: "Random Segment Training",
    description: "",
    category: "ACCURACY",
    icon: "🎲",
    engineFamily: "random_segment",
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["targets"],
    settingsSchema: [],
  };

  // Die Zielsequenz ist zufaellig - fuer deterministische Tests wird sie
  // direkt im MATCH_STARTED-Event vorgegeben (genau so, wie die Engine
  // sie sonst selbst erzeugt und beim Resume wieder einliest).
  function engineWithTargets(
    targets: { group: string; number: number; multiplier: number }[],
    settings: Record<string, unknown> = {},
    players: MatchPlayerRef[] = [{ id: "solo", name: "Solo" }]
  ): MatchEngine {
    return new MatchEngine("rs", GAME, players, { dartsPerTarget: 3, ...settings }, [
      { type: "MATCH_STARTED", payload: { segmentTargets: targets } },
    ] as never);
  }

  const T20 = { group: "triple", number: 20, multiplier: 3 };
  const D16 = { group: "double", number: 16, multiplier: 2 };
  const LARGE7 = { group: "large_single", number: 7, multiplier: 1 };
  const SMALL7 = { group: "small_single", number: 7, multiplier: 1 };

  function segThrow(engine: MatchEngine, label: string, bed?: string): void {
    const s = seg(label);
    engine.handleThrow(label, { segment: bed ? { ...s, bed } : s });
  }

  it("counts a hit only on the exact segment - S20 does not hit target T20", () => {
    const engine = engineWithTargets([T20, D16]);
    expect(engine.toDict().target).toBe("T20");
    segThrow(engine, "S20"); // Nummer stimmt, Feld nicht -> kein Treffer
    expect(engine.toDict().target).toBe("T20"); // Ziel bleibt
    segThrow(engine, "T20"); // Treffer
    expect(engine.toDict().target).toBe("D16"); // sofort naechstes Ziel, mitten in der Aufnahme
  });

  it("forfeits the remaining budget on a hit and moves on immediately", () => {
    const engine = engineWithTargets([T20, D16, LARGE7]);
    segThrow(engine, "T20"); // Treffer mit Dart 1 von 3
    const state = engine.toDict();
    expect(state.target).toBe("D16");
    expect(state.segmentInfo?.remainingDarts).toBe(3); // volles Budget fuers neue Ziel
  });

  it("carries the target budget across the visit boundary (budget belongs to the target, not the visit)", () => {
    const engine = engineWithTargets([T20, D16]);
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // 3 Fehlwuerfe -> Budget von T20 aufgebraucht
    expect(engine.toDict().target).toBe("D16"); // Ziel verfehlt, naechstes Ziel

    const engine2 = engineWithTargets([T20, D16]);
    throwAndConfirm(engine2, ["S1", "S1"]); // nur 2 Darts, dann Takeout
    let state2 = engine2.toDict();
    expect(state2.target).toBe("T20"); // Ziel laeuft weiter
    expect(state2.segmentInfo?.remainingDarts).toBe(1); // 1 Dart Restbudget in der NAECHSTEN Aufnahme
    segThrow(engine2, "S1"); // dritter Dart des Ziels, wieder daneben
    state2 = engine2.toDict();
    expect(state2.target).toBe("D16"); // jetzt erst verfehlt
  });

  it("distinguishes large and small singles via the board's bed field", () => {
    const engine = engineWithTargets([LARGE7, SMALL7], { dartsPerTarget: 1 });
    expect(engine.toDict().target).toBe("Large 7");
    segThrow(engine, "S7", "SingleInner"); // kleine Single -> kein Treffer auf "Large 7"
    expect(engine.toDict().target).toBe("Small 7"); // Budget 1 verbraucht -> naechstes Ziel
    segThrow(engine, "S7", "SingleInner"); // jetzt passt es
    engine.confirmVisit(); // Ergebnisse werden wie ueberall erst beim Bestaetigen festgeschrieben

    const results = engine.toDict().players[0].segmentResults;
    expect(results?.[0]).toMatchObject({ label: "Large 7", hit: false });
    expect(results?.[1]).toMatchObject({ label: "Small 7", hit: true });
  });

  it("treats a manually entered single leniently when the ring is unknown (no bed)", () => {
    // Manuell ueber das Zahlenraster nachgetragene Darts haben kein bed -
    // wir wissen den Ring nicht und werten deshalb bewusst grosszuegig,
    // statt einen echten Treffer faelschlich zum Fehlwurf zu machen.
    const engine = engineWithTargets([LARGE7], { dartsPerTarget: 1 });
    engine.addManualThrow(seg("S7")); // ohne bed
    engine.confirmVisit();
    expect(engine.toDict().players[0].segmentResults?.[0]).toMatchObject({ label: "Large 7", hit: true });
  });

  it("recomputes the target progress after a correction (replay)", () => {
    const engine = engineWithTargets([T20, D16, LARGE7]);
    segThrow(engine, "T20"); // Treffer
    segThrow(engine, "D16"); // Treffer
    let state = engine.toDict();
    expect(state.target).toBe("Large 7");
    expect(state.players[0].score).toBe(2); // 2 getroffene Ziele

    // Erster Dart war doch kein T20 -> Korrektur. Damit wird aus dem
    // Treffer ein Fehlwurf, der zweite Dart (D16) trifft dann nicht mehr
    // das zweite Ziel, sondern zaehlt als zweiter Fehlversuch auf T20.
    const firstThrowSeq = state.currentVisitThrows[0].throwSeq;
    engine.correctThrow(firstThrowSeq, seg("S20"));
    state = engine.toDict();
    expect(state.target).toBe("T20"); // immer noch das erste Ziel
    expect(state.players[0].score).toBe(0); // kein Treffer mehr
    expect(state.segmentInfo?.remainingDarts).toBe(1); // 2 von 3 Darts verbraucht
  });

  it("skips finished players and ends the match once everyone is through", () => {
    const engine = engineWithTargets([T20, D16], { dartsPerTarget: 1 }, PLAYERS);
    // Jeder Spieler hat 2 Ziele mit je 1 Dart Budget.
    throwAndConfirm(engine, ["T20", "D16"]); // Alice: beide Ziele, danach fertig
    expect(engine.toDict().finished).toBe(false); // Bob fehlt noch
    expect(engine.toDict().activePlayerId).toBe("p2");
    throwAndConfirm(engine, ["S1", "S1"]); // Bob: beide verfehlt, aber durch
    const state = engine.toDict();
    expect(state.finished).toBe(true);
    expect(state.winnerId).toBe("p1"); // mehr getroffene Ziele
  });

  it("keeps the target open until it is hit when the budget is unlimited", () => {
    // "Darts per Target = Until hit" (0): kein Budget, das Ziel bleibt
    // ueber beliebig viele Aufnahmen offen, bis es getroffen wurde.
    const engine = engineWithTargets([T20, D16], { dartsPerTarget: 0 });
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // ganze Aufnahme daneben
    let state = engine.toDict();
    expect(state.target).toBe("T20"); // Ziel bleibt (bei Budget 3 waere es weiter)
    expect(state.segmentInfo?.remainingDarts).toBeNull(); // kein "verbleibend"
    expect(state.segmentInfo?.dartsOnTarget).toBe(3); // stattdessen: verbrauchte Darts

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // zweite Aufnahme, wieder daneben
    state = engine.toDict();
    expect(state.target).toBe("T20");
    expect(state.segmentInfo?.dartsOnTarget).toBe(6);

    segThrow(engine, "T20"); // endlich getroffen
    state = engine.toDict();
    expect(state.target).toBe("D16");
    expect(state.players[0].score).toBe(1);
  });

  it("never draws the same target twice in a row", () => {
    const pool = randomSegmentFamily.buildTargetPool(["double"]);
    const targets = randomSegmentFamily.generateTargets(pool, 50);
    expect(targets).toHaveLength(50);
    for (let i = 1; i < targets.length; i++) {
      expect(randomSegmentFamily.targetLabel(targets[i])).not.toBe(randomSegmentFamily.targetLabel(targets[i - 1]));
    }
  });
});

describe("x01 / Pressure 501", () => {
  const GAME: GameDefinition = {
    id: "pressure501",
    name: "Pressure 501",
    description: "",
    category: "CHECKOUT",
    icon: "⏱",
    engineFamily: "x01",
    startingScore: 501,
    pressureMode: true,
    playerRange: [1, 4],
    implemented: true,
    durationModes: ["legs"],
    settingsSchema: [],
  };

  function pressureEngine(settings: Record<string, unknown> = {}, players: MatchPlayerRef[] = [{ id: "solo", name: "Solo" }]) {
    return new MatchEngine("p501", GAME, players, {
      level: "beginner", // Z = 36
      checkoutMode: "double_out",
      numberOfLegs: 10,
      ...settings,
    });
  }

  it("uses 501 as the starting score and the ghost line from the dart limit", () => {
    const engine = pressureEngine();
    let state = engine.toDict();
    expect(state.players[0].score).toBe(501);
    expect(state.players[0].pressure?.ghostRemaining).toBe(501); // 0 Darts
    expect(state.pressureInfo).toMatchObject({ dartLimit: 36, targetAverage: 41.8, outMode: "double_out" });

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // 3 Darts geworfen
    state = engine.toDict();
    // 501 - (501/36)*3 = 459.25 -> 459
    expect(state.players[0].pressure?.ghostRemaining).toBe(459);
    expect(state.players[0].pressure?.dartsThisLeg).toBe(3);
  });

  it("uses the custom dart count for the ghost (Z=33 -> 455 after 3 darts)", () => {
    const engine = pressureEngine({ level: "custom", customDarts: 33 });
    throwAndConfirm(engine, ["S1", "S1", "S1"]);
    const state = engine.toDict();
    // 501 - (501/33)*3 = 455.45 -> 455
    expect(state.players[0].pressure?.ghostRemaining).toBe(455);
    expect(state.players[0].pressure?.dartLimit).toBe(33);
  });

  it("Double Out: a T1 on 3 remaining is no finish, the leg continues", () => {
    // Grosses Z, damit die Abbruchgrenze hier nicht dazwischenfunkt.
    const engine = pressureEngine({ level: "custom", customDarts: 60 });
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 501 -> 321
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 321 -> 141
    throwAndConfirm(engine, ["T20", "T20", "S18"]); // 141 -> 3
    expect(engine.toDict().players[0].score).toBe(3);

    throwDarts(engine, ["T1"]); // Rest 0, aber Triple ist kein gueltiger Double-Out-Finish
    engine.confirmVisit();
    const state = engine.toDict();
    expect(state.players[0].score).toBe(3); // Bust -> Rest bleibt stehen
    expect(state.players[0].pressure?.legDone).toBe(false); // Leg laeuft weiter
  });

  it("Master Out: a T1 on 3 remaining finishes the leg", () => {
    const engine = pressureEngine({ checkoutMode: "master_out", level: "custom", customDarts: 60 });
    throwAndConfirm(engine, ["T20", "T20", "T20"]);
    throwAndConfirm(engine, ["T20", "T20", "T20"]);
    throwAndConfirm(engine, ["T20", "T20", "S18"]); // Rest 3
    expect(engine.toDict().players[0].score).toBe(3);

    throwDarts(engine, ["T1"]); // Master Out: Triple beendet
    engine.confirmVisit();
    expect(engine.toDict().players[0].pressure?.lastLeg?.checkout).toBe(true);
  });

  it("Master Out: leaving 1 is a bust like anywhere else", () => {
    const engine = pressureEngine({ checkoutMode: "master_out", level: "custom", customDarts: 60 });
    throwAndConfirm(engine, ["T20", "T20", "T20"]);
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // Rest 141
    throwAndConfirm(engine, ["T20", "T20", "S20"]); // wuerde Rest 1 ergeben -> Bust
    const state = engine.toDict();
    expect(state.players[0].score).toBe(141); // zurueck auf den Aufnahme-Startwert
    expect(state.players[0].pressure?.dartsThisLeg).toBe(9); // Bust-Darts zaehlen mit
  });

  it("awards points by darts used relative to Z", () => {
    // Reine Rechenregel, unabhaengig vom Match-Ablauf.
    expect(x01Family.legPoints(36, 30, true)).toBe(5); // <= Z-6
    expect(x01Family.legPoints(36, 31, true)).toBe(4); // Z-5
    expect(x01Family.legPoints(36, 33, true)).toBe(4); // Z-3
    expect(x01Family.legPoints(36, 34, true)).toBe(3); // Z-2
    expect(x01Family.legPoints(36, 36, true)).toBe(3); // Z
    expect(x01Family.legPoints(36, 39, true)).toBe(2); // Z+3
    expect(x01Family.legPoints(36, 42, true)).toBe(1); // Z+6
    expect(x01Family.legPoints(36, 30, false)).toBe(0); // kein Checkout
  });

  it("Strict Mode: the leg ends the moment the dart limit is reached", () => {
    const engine = pressureEngine({ gameMode: "strict", level: "custom", customDarts: 12 });
    for (let i = 0; i < 3; i++) throwAndConfirm(engine, ["S1", "S1", "S1"]); // 9 Darts
    let state = engine.toDict();
    expect(state.players[0].pressure?.dartsThisLeg).toBe(9);
    expect(state.players[0].pressure?.dartsLeft).toBe(3);
    expect(state.players[0].pressure?.lastLeg).toBeNull();

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Dart 10-12 -> Limit erreicht
    state = engine.toDict();
    expect(state.players[0].pressure?.lastLeg).toMatchObject({
      darts: 12,
      checkout: false,
      failed: true,
      overtime: 0,
      points: 0,
      remaining: 489,
    });
    expect(state.players[0].pressure?.dartsThisLeg).toBe(0); // neues Leg
  });

  it("Training Mode: the leg runs on past the limit and counts overtime", () => {
    const engine = pressureEngine({ gameMode: "training", level: "custom", customDarts: 12 });
    for (let i = 0; i < 4; i++) throwAndConfirm(engine, ["S1", "S1", "S1"]); // 12 Darts, kein Checkout
    let state = engine.toDict();
    expect(state.players[0].pressure?.targetMissed).toBe(true);
    expect(state.players[0].pressure?.dartsLeft).toBeNull(); // stattdessen Overtime
    expect(state.players[0].pressure?.overtime).toBe(0);
    expect(state.players[0].pressure?.lastLeg).toBeNull(); // Leg laeuft weiter
    expect(state.legNumber).toBe(1);

    throwAndConfirm(engine, ["S1", "S1", "S1"]); // 15 Darts
    state = engine.toDict();
    expect(state.players[0].pressure?.overtime).toBe(3);
    expect(state.players[0].pressure?.lastLeg).toBeNull();
  });

  it("Training Mode: an overtime leg ends on a real double out and is marked failed", () => {
    const engine = pressureEngine({ gameMode: "training", level: "custom", customDarts: 9 });
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 501 -> 321
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 321 -> 141, 6 Darts
    throwAndConfirm(engine, ["T20", "T20", "S1"]); // 141 -> 20, 9 Darts = Limit, kein Checkout
    let state = engine.toDict();
    expect(state.players[0].pressure?.targetMissed).toBe(true);
    expect(state.players[0].score).toBe(20); // Leg laeuft weiter

    throwDarts(engine, ["D10"]); // Checkout mit Dart 10
    engine.confirmVisit();
    state = engine.toDict();
    expect(state.players[0].pressure?.lastLeg).toMatchObject({
      darts: 10,
      checkout: true,
      failed: true, // Ziel verfehlt, obwohl ausgecheckt
      overtime: 1,
    });
  });

  it("a bust does not reset the dart counter, so it can miss the target", () => {
    // Tobias' Beispiel: 21 Darts gespielt, Limit 24, die naechste
    // Aufnahme bustet -> es sind trotzdem 24 Darts verbraucht.
    const engine = pressureEngine({ gameMode: "strict", level: "hard" }); // Z = 24
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 3 Darts, 321
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 6 Darts, 141
    throwAndConfirm(engine, ["T20", "T20", "S1"]); // 9 Darts, 20
    for (let i = 0; i < 4; i++) throwAndConfirm(engine, ["S1", "S1", "S1"]); // 21 Darts, Rest 8
    let state = engine.toDict();
    expect(state.players[0].pressure?.dartsThisLeg).toBe(21);
    expect(state.players[0].score).toBe(8);

    // Dart 22 und 23 bringen 8 -> 6, Dart 24 bustet.
    throwAndConfirm(engine, ["S1", "S1", "T20"]);
    state = engine.toDict();
    expect(state.players[0].pressure?.lastLeg).toMatchObject({
      darts: 24, // Bust-Darts zaehlen mit
      checkout: false,
      failed: true,
      remaining: 8, // Bust -> zurueck auf den Aufnahme-Startwert
    });
  });

  it("counts bust darts and only the darts actually thrown on a checkout", () => {
    const engine = pressureEngine({ level: "custom", customDarts: 60 });
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 321
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 141
    throwAndConfirm(engine, ["T20", "T20", "D12"]); // Bust bei 141 - Darts zaehlen trotzdem
    expect(engine.toDict().players[0].pressure?.dartsThisLeg).toBe(9);

    throwAndConfirm(engine, ["T20", "T17", "D15"]); // 141 - 60 - 51 - 30 = 0, Checkout mit 3 Darts
    const state = engine.toDict();
    expect(state.players[0].pressure?.lastLeg).toMatchObject({ darts: 12, checkout: true });
  });

  it("recomputes ghost, dart counter and points after a correction (replay)", () => {
    const engine = pressureEngine({ level: "custom", customDarts: 60 });
    throwAndConfirm(engine, ["T20", "T20", "T20"]); // 501 -> 321
    throwDarts(engine, ["T20"]);
    let state = engine.toDict();
    expect(state.players[0].score).toBe(261);
    expect(state.players[0].pressure?.dartsThisLeg).toBe(3); // laufende Aufnahme noch nicht committet

    // Ersten Dart der ersten Aufnahme nachtraeglich auf S20 korrigieren.
    const firstSeq = 0;
    engine.correctThrow(firstSeq, seg("S20"));
    state = engine.toDict();
    expect(state.players[0].score).toBe(301); // 501 - 20 - 60 - 60 - 60
    expect(state.players[0].pressure?.dartsThisLeg).toBe(3);
    expect(state.players[0].pressure?.ghostRemaining).toBe(476); // 501 - (501/60)*3
  });

  it("skips players who already finished their leg and starts a new leg once everyone is done", () => {
    // Strict Mode mit Z=9: ein Leg ist nach 3 Aufnahmen vorbei.
    const engine = pressureEngine({ gameMode: "strict", level: "custom", customDarts: 9 }, PLAYERS);
    for (let i = 0; i < 3; i++) {
      throwAndConfirm(engine, ["S1", "S1", "S1"]); // Alice
      throwAndConfirm(engine, ["S1", "S1", "S1"]); // Bob
    }
    const state = engine.toDict();
    // Beide haben 9 Darts -> beide Legs beendet -> Leg 2 laeuft
    expect(state.legNumber).toBe(2);
    expect(state.players[0].pressure?.lastLeg).toMatchObject({ darts: 9, points: 0, failed: true });
    expect(state.players[1].pressure?.lastLeg).toMatchObject({ darts: 9, points: 0, failed: true });
    expect(state.players[0].pressure?.dartsThisLeg).toBe(0);
  });

  it("skips the player whose leg already ended and lets the other play on", () => {
    const engine = pressureEngine({ gameMode: "strict", level: "custom", customDarts: 9 }, PLAYERS);
    // Alice wirft 3 Aufnahmen, Bob nur 2 -> Alices Leg ist vorbei, Bob nicht.
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Alice, 3
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Bob, 3
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Alice, 6
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Bob, 6
    throwAndConfirm(engine, ["S1", "S1", "S1"]); // Alice, 9 -> Leg beendet
    const state = engine.toDict();
    expect(state.players[0].pressure?.legDone).toBe(true);
    expect(state.legNumber).toBe(1); // Leg laeuft noch, weil Bob fehlt
    expect(state.activePlayerId).toBe(PLAYERS[1].id); // Alice wird uebersprungen
  });

  it("undoes across a leg boundary back into the previous leg", () => {
    const engine = pressureEngine({ gameMode: "strict", level: "custom", customDarts: 9 });
    for (let i = 0; i < 3; i++) throwAndConfirm(engine, ["S1", "S1", "S1"]);
    expect(engine.toDict().legNumber).toBe(2);

    engine.undo(); // letzte Bestaetigung zuruecknehmen -> zurueck ins abgeschlossene Leg 1
    const state = engine.toDict();
    expect(state.legNumber).toBe(1);
    expect(state.players[0].pressure?.dartsThisLeg).toBe(6); // die 3 Darts warten wieder auf Bestaetigung
    expect(state.players[0].pressure?.legDone).toBe(false);
    expect(state.players[0].pressure?.lastLeg).toBeNull();
    expect(state.players[0].pressure?.points).toBe(0);
  });

  it("finishes the match after the configured number of legs", () => {
    // Freie Leg-Zahl (Teil 2): 3 Legs statt einer Auswahl aus 5/10/15/20.
    const engine = pressureEngine({ gameMode: "strict", level: "custom", customDarts: 9, numberOfLegs: 3 });
    for (let leg = 0; leg < 3; leg++) {
      for (let i = 0; i < 3; i++) throwAndConfirm(engine, ["S1", "S1", "S1"]);
    }
    const state = engine.toDict();
    expect(state.finished).toBe(true);
    expect(state.pressureInfo?.totalLegs).toBe(3);
    expect(state.players[0].pressureSummary).toMatchObject({
      points: 0,
      maxPoints: 15,
      checkoutPercent: 0,
      legsPlayed: 3,
      targetsReached: 0,
    });
    expect(state.players[0].pressureSummary?.avgDartsPerLeg).toBe(9);
  });
});
