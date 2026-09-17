import { describe, expect, it } from "vitest";
import { GameDefinition } from "../../api";
import { MatchEngine } from "../../engine/matchEngine";
import { Segment } from "../../engine/scoring";
import { finishedLegDarts, reconstructAttempts, Visit } from "../gameStats";
import { STATIC_GAMES } from "../../staticGames";

const PLAYER = [{ id: "p1", name: "P1" }];

function seg(label: string): Segment {
  if (label === "MISS") return { number: 0, multiplier: 0 };
  if (label === "BULL") return { number: 25, multiplier: 2 };
  const multiplier = label[0] === "T" ? 3 : label[0] === "D" ? 2 : 1;
  return { number: parseInt(label.slice(1), 10), multiplier };
}

function game(id: string): GameDefinition {
  const found = STATIC_GAMES.find((g) => g.id === id);
  if (!found) throw new Error(`Spiel "${id}" nicht gefunden`);
  return found;
}

function throwAndConfirm(engine: MatchEngine, labels: string[]) {
  for (const l of labels) engine.handleThrow(l, { segment: seg(l) });
  engine.confirmVisit();
}

function visitsOf(engine: MatchEngine, playerId: string): Visit[] {
  return engine.visitLog.filter((v) => v.playerId === playerId);
}

describe("gameStats – Herleitungen aus dem Replay", () => {
  // Die Versuchsgrenzen sind die EINZIGE Stelle, an der die Statistik
  // eine Engine-Regel nachbildet (commitTaskVisit). Dieser Test haelt
  // beide Seiten zusammen: die Rekonstruktion muss exakt dieselbe Zahl
  // an Versuchen und Erfolgen liefern wie die Engine selbst zaehlt.
  it("rekonstruiert Versuche genau so, wie die Engine sie zaehlt (Random Checkout)", () => {
    const engine = new MatchEngine("m1", game("random_checkout"), PLAYER, {
      minCheckout: 40,
      maxCheckout: 120,
      endless: false,
      numberOfCheckouts: 4,
      dartsPerCheckout: 6, // 2 Aufnahmen pro Versuch
    });

    // Vier Versuche, bewusst gemischt: daneben, daneben, Checkout, daneben.
    for (let i = 0; i < 4; i++) {
      const target = engine.randomTargets[i];
      if (target === undefined) break;
      // Erste Aufnahme immer daneben.
      throwAndConfirm(engine, ["S1", "S1", "S1"]);
      if (engine.finished) break;
      throwAndConfirm(engine, ["S1", "S1", "S1"]);
      if (engine.finished) break;
    }

    const state = engine.playerStates.p1 as { attempts: number; successfulCheckouts: number };
    const rebuilt = reconstructAttempts(visitsOf(engine, "p1"), 2);
    expect(rebuilt.length).toBe(state.attempts);
    expect(rebuilt.filter((a) => a.success).length).toBe(state.successfulCheckouts);
  });

  it("rekonstruiert Versuche auch bei 121 deckungsgleich", () => {
    const engine = new MatchEngine("m2", game("121"), PLAYER, {
      startLevel: 121,
      maxLevel: 170,
      safehouseMode: "standard",
      checkoutMode: "double_out",
      gameLengthMode: "custom",
      customTargets: 3,
      dartsPerCheckout: 9, // 3 Aufnahmen pro Versuch
    });

    for (let i = 0; i < 9 && !engine.finished; i++) {
      throwAndConfirm(engine, ["S1", "S1", "S1"]);
    }

    const state = engine.playerStates.p1 as { attempts: number; successfulCheckouts: number };
    const rebuilt = reconstructAttempts(visitsOf(engine, "p1"), 3);
    expect(rebuilt.length).toBe(state.attempts);
    expect(rebuilt.filter((a) => a.success).length).toBe(state.successfulCheckouts);
  });

  it("zaehlt Darts pro Leg nur fuer abgeschlossene Legs", () => {
    const visits: Visit[] = [
      { throws: [seg("T20"), seg("T20"), seg("T20")], outcome: null, value: 180 },
      { throws: [seg("T20"), seg("T19"), seg("D12")], outcome: "checkout", value: 141 },
      { throws: [seg("T20"), seg("T20"), seg("T20")], outcome: null, value: 180 },
    ];
    // Erstes Leg: 6 Darts. Das angefangene zweite Leg zaehlt nicht mit.
    expect(finishedLegDarts(visits)).toEqual([6]);
  });

  it("gibt bei einem Leg ohne Checkout gar keinen Wert zurueck", () => {
    const visits: Visit[] = [{ throws: [seg("S1"), seg("S1"), seg("S1")], outcome: null, value: 3 }];
    expect(finishedLegDarts(visits)).toEqual([]);
  });

  it("zaehlt einen Checkout mit weniger als 3 Darts korrekt", () => {
    const visits: Visit[] = [
      { throws: [seg("T20"), seg("T20"), seg("T20")], outcome: null, value: 180 },
      { throws: [seg("T20"), seg("D20")], outcome: "checkout", value: 100 },
    ];
    expect(finishedLegDarts(visits)).toEqual([5]);
  });
});
