// Neue Tests fuer den TS-Port der MatchEngine (Phase C des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - es gibt
// kein Python-Aequivalent dieser Tests (das Original hatte keine
// Engine-Tests, nur Checkout-Tests, siehe checkout.test.ts), daher
// hier neu geschrieben statt portiert. Deckt den Event-Sourcing-Kern
// (Replay, Undo, Korrektur) und die x01-Regeln (Bust, Checkout,
// Leg-Wechsel) ab. Die reinen Bust-/Finish-Regeln selbst (z.B. "Rest 1
// ist Bust") sind bereits in checkout.test.ts gegen scoring.ts direkt
// abgedeckt - hier geht es um das Zusammenspiel mit Event-Log/Replay.
import { describe, expect, it } from "vitest";
import { GameDefinition } from "../../api";
import { MatchEngine, MatchPlayerRef } from "../matchEngine";
import { Segment } from "../scoring";

const GAME: GameDefinition = {
  id: "170",
  name: "170",
  description: "",
  category: "CHECKOUT",
  icon: "🎯",
  engineFamily: "x01",
  playerRange: [1, 4],
  implemented: true,
  durationModes: ["legs"],
  settingsSchema: [],
};

const PLAYERS: MatchPlayerRef[] = [
  { id: "p1", name: "Alice" },
  { id: "p2", name: "Bob" },
];

function seg(label: string): Segment {
  const upper = label.toUpperCase();
  if (upper === "BULL") return { number: 25, multiplier: 2 };
  const prefix = upper[0];
  const number = parseInt(upper.slice(1), 10);
  const multiplier = ({ S: 1, D: 2, T: 3 } as Record<string, number>)[prefix];
  return { number, multiplier };
}

function newEngine(settings: Record<string, unknown> = { matchMode: "1_leg" }, players = PLAYERS): MatchEngine {
  return new MatchEngine("m1", GAME, players, settings);
}

function throwAndConfirm(engine: MatchEngine, labels: string[]): void {
  for (const label of labels) engine.handleThrow(label, { segment: seg(label) });
  engine.confirmVisit();
}

describe("MatchEngine core (x01)", () => {
  it("starts with 170 for every player, player 1 active", () => {
    const engine = newEngine();
    const state = engine.toDict();
    expect(state.players[0].score).toBe(170);
    expect(state.players[1].score).toBe(170);
    expect(state.activePlayerId).toBe("p1");
  });

  it("counts down score and switches player after a confirmed visit", () => {
    const engine = newEngine();
    throwAndConfirm(engine, ["S20", "S20", "S20"]); // 170 - 60 = 110
    const state = engine.toDict();
    expect(state.players[0].score).toBe(110);
    expect(state.activePlayerId).toBe("p2");
  });

  it("busts on overthrow and resets score to visit-start value", () => {
    const engine = newEngine();
    throwAndConfirm(engine, ["T20", "T20", "T19"]); // 60+60+57=177 > 170 -> bust
    const state = engine.toDict();
    expect(state.players[0].score).toBe(170);
    expect(state.activePlayerId).toBe("p2"); // player still switches after a bust
  });

  it("live score updates mid-visit before confirmation", () => {
    const engine = newEngine();
    engine.handleThrow("T20", { segment: seg("T20") });
    const state = engine.toDict();
    expect(state.players[0].score).toBe(110);
    expect(state.pendingConfirmation).toBe(false);
  });

  it("checks out with a valid double and wins the leg (1_leg mode)", () => {
    const engine = newEngine({ matchMode: "1_leg", checkoutMode: "double_out" });
    throwAndConfirm(engine, ["T20", "T20", "S10"]); // p1: 170-60-60-10=40
    expect(engine.toDict().activePlayerId).toBe("p2");
    throwAndConfirm(engine, ["S1"]); // p2: irrelevant dummy visit
    engine.handleThrow("D20", { segment: seg("D20") }); // p1 finishes at 0
    const pending = engine.toDict();
    expect(pending.pendingConfirmation).toBe(true);
    expect(pending.pendingOutcome).toBe("checkout");
    engine.confirmVisit();
    const after = engine.toDict();
    expect(after.finished).toBe(true);
    expect(after.winnerId).toBe("p1");
    expect(after.players[0].legsWon).toBe(1);
    expect(after.players[0].highestCheckout).toBe(40);
  });

  it("undo reverts the last event, including an already-processed visit", () => {
    const engine = newEngine();
    throwAndConfirm(engine, ["T20", "T20", "S10"]); // p1 -> 40, active player 2
    expect(engine.toDict().activePlayerId).toBe("p2");
    expect(engine.toDict().canUndo).toBe(true);
    engine.undo(); // undoes VISIT_CONFIRMED
    const afterUndo = engine.toDict();
    expect(afterUndo.pendingConfirmation).toBe(true);
    expect(afterUndo.activePlayerId).toBe("p1");
    expect(afterUndo.players[0].score).toBe(40);
  });

  it("correcting a past throw retroactively changes the outcome on replay", () => {
    const engine = newEngine();
    engine.handleThrow("T20", { segment: seg("T20") });
    engine.handleThrow("T20", { segment: seg("T20") });
    engine.handleThrow("S10", { segment: seg("S10") });
    engine.confirmVisit(); // player 1 at 40
    const throwSeq = 0; // first THROW event
    engine.correctThrow(throwSeq, seg("S1")); // change first T20 -> S1
    const state = engine.toDict();
    // 170 - 1 - 60 - 10 = 99
    expect(state.players[0].score).toBe(99);
  });

  it("accepts new throws for the next player right after a visit is confirmed", () => {
    const engine = newEngine();
    throwAndConfirm(engine, ["T20", "T20", "T19"]); // p1 bust
    const accepted = engine.handleThrow("S1", { segment: seg("S1") });
    expect(accepted).toBe(true);
    expect(engine.toDict().players[1].score).toBe(169);
  });

  it("rejects new throws while a visit is pending confirmation", () => {
    const engine = newEngine();
    engine.handleThrow("S1", { segment: seg("S1") });
    engine.handleThrow("S1", { segment: seg("S1") });
    engine.handleThrow("S1", { segment: seg("S1") }); // 3rd dart -> visit cap reached, pending
    expect(engine.toDict().pendingConfirmation).toBe(true);
    const rejected = engine.handleThrow("S1", { segment: seg("S1") });
    expect(rejected).toBe(false);
  });

  it("rotates the starting player each new leg", () => {
    const engine = newEngine({ matchMode: "bo3", checkoutMode: "double_out" });
    throwAndConfirm(engine, ["T20", "T20", "S10"]); // p1 -> 40
    throwAndConfirm(engine, ["S1"]); // p2 dummy visit
    throwAndConfirm(engine, ["D20"]); // p1 finishes leg 1
    const afterLeg1 = engine.toDict();
    expect(afterLeg1.finished).toBe(false); // bo3 needs 2 legs
    expect(afterLeg1.legNumber).toBe(2);
    expect(afterLeg1.activePlayerId).toBe("p2"); // starting player rotates to p2
    expect(afterLeg1.players[0].score).toBe(170);
  });
});
