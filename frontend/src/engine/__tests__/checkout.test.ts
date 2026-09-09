// 1:1-Port von backend/tests/test_checkout.py (Phase B des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - dient als
// Paritaets-Nachweis, dass der TS-Port dieselben 21 Faelle besteht wie
// die Python-Referenz. Ausfuehren mit: npm test (im frontend/-Ordner).
import { describe, expect, it } from "vitest";
import { suggestRoute } from "../checkout";
import { DOUBLE_OUT_TABLE } from "../checkoutTable";
import { applyCountdownThrow, isValidFinisher, Segment } from "../scoring";

const BOGEY_NUMBERS = [159, 162, 163, 165, 166, 168, 169];

function seg(label: string): Segment {
  const upper = label.toUpperCase();
  if (upper === "BULL") return { number: 25, multiplier: 2 };
  if (upper === "SBULL") return { number: 25, multiplier: 1 };
  const prefix = upper[0];
  const number = parseInt(upper.slice(1), 10);
  const multiplier = ({ S: 1, D: 2, T: 3 } as Record<string, number>)[prefix];
  return { number, multiplier };
}

function routeValue(route: string[]): number {
  return route.reduce((total, label) => {
    const s = seg(label);
    return total + s.number * s.multiplier;
  }, 0);
}

describe("Double Out reference table", () => {
  const TWO_DART_EXAMPLES: Record<number, string> = {
    61: "T15,D8", 62: "T10,D16", 63: "T13,D12", 64: "T16,D8", 65: "T19,D4",
    66: "T10,D18", 67: "T17,D8", 68: "T20,D4", 69: "T19,D6", 70: "T18,D8",
    81: "T19,D12", 82: "T14,D20", 83: "T17,D16", 84: "T20,D12", 85: "T15,D20",
    86: "T18,D16", 87: "T17,D18", 88: "T16,D20", 89: "T19,D16", 90: "T18,D18",
    91: "T17,D20", 92: "T20,D16", 93: "T19,D18", 94: "T18,D20", 95: "T19,D19",
    96: "T20,D18", 97: "T19,D20", 98: "T20,D19", 100: "T20,D20",
    101: "T17,BULL", 104: "T18,BULL", 107: "T19,BULL", 110: "T20,BULL",
  };

  const THREE_DART_EXAMPLES: Record<number, string> = {
    170: "T20,T20,BULL", 167: "T20,T19,BULL", 164: "T20,T18,BULL",
    161: "T20,T17,BULL", 160: "T20,T20,D20", 121: "T20,T11,D14",
  };

  it("two-dart examples with three darts available", () => {
    for (const [remaining, expected] of Object.entries(TWO_DART_EXAMPLES)) {
      const route = suggestRoute(Number(remaining), 3, "double_out");
      expect(route?.join(",")).toBe(expected);
    }
  });

  it("two-dart examples with exactly two darts", () => {
    for (const [remaining, expected] of Object.entries(TWO_DART_EXAMPLES)) {
      const route = suggestRoute(Number(remaining), 2, "double_out");
      expect(route?.join(",")).toBe(expected);
    }
  });

  it("three-dart examples", () => {
    for (const [remaining, expected] of Object.entries(THREE_DART_EXAMPLES)) {
      const route = suggestRoute(Number(remaining), 3, "double_out");
      expect(route?.join(",")).toBe(expected);
    }
  });

  it("121 needs three darts, no checkout with two", () => {
    expect(suggestRoute(121, 2, "double_out")).toBeNull();
  });

  it("bogey numbers have no checkout", () => {
    for (const n of BOGEY_NUMBERS) {
      expect(suggestRoute(n, 3, "double_out")).toBeNull();
      expect(DOUBLE_OUT_TABLE[n]).toBeUndefined();
    }
  });

  it("table routes are internally consistent", () => {
    for (const [remainingStr, route] of Object.entries(DOUBLE_OUT_TABLE)) {
      const remaining = Number(remainingStr);
      expect(route.length).toBeLessThanOrEqual(3);
      expect(routeValue(route)).toBe(remaining);
      const last = seg(route[route.length - 1]);
      expect(isValidFinisher(last, "double_out")).toBe(true);
    }
  });
});

describe("Master Out direct finish", () => {
  it("direct triple outs", () => {
    const cases: Record<number, string> = { 60: "T20", 57: "T19", 54: "T18", 51: "T17", 45: "T15", 30: "T10", 3: "T1" };
    for (const [remaining, expected] of Object.entries(cases)) {
      expect(suggestRoute(Number(remaining), 1, "master_out")).toEqual([expected]);
    }
  });

  it("direct doubles preferred over alternative triple", () => {
    const cases: Record<number, string> = { 40: "D20", 32: "D16", 36: "D18", 24: "D12" };
    for (const [remaining, expected] of Object.entries(cases)) {
      expect(suggestRoute(Number(remaining), 1, "master_out")).toEqual([expected]);
    }
  });

  it("bull", () => {
    expect(suggestRoute(50, 1, "master_out")).toEqual(["BULL"]);
  });

  it("invalid single-out at 20 remaining", () => {
    expect(suggestRoute(20, 1, "master_out")).toEqual(["D10"]);
    const result = applyCountdownThrow(20, [seg("S20")], "master_out");
    expect(result.outcome).toBe("bust");
  });

  it("single never finishes under master_out", () => {
    const bustResult = applyCountdownThrow(20, [seg("S1"), seg("S1"), seg("S18")], "master_out");
    expect(bustResult.outcome).toBe("bust");
    const okResult = applyCountdownThrow(20, [seg("D10")], "master_out");
    expect(okResult.outcome).toBe("checkout");
  });
});

describe("Double Out vs Master Out comparison", () => {
  it("60 with one dart", () => {
    expect(suggestRoute(60, 1, "double_out")).toBeNull();
    expect(suggestRoute(60, 1, "master_out")).toEqual(["T20"]);
  });

  it("57 with one dart", () => {
    expect(suggestRoute(57, 1, "double_out")).toBeNull();
    expect(suggestRoute(57, 1, "master_out")).toEqual(["T19"]);
  });

  it("40 with one dart is identical in both modes", () => {
    expect(suggestRoute(40, 1, "double_out")).toEqual(["D20"]);
    expect(suggestRoute(40, 1, "master_out")).toEqual(["D20"]);
  });

  it("master_out prefers shortest route over double_out route", () => {
    expect(suggestRoute(60, 3, "master_out")).toEqual(["T20"]);
  });

  it("81 with two darts: no shorter master_out route exists", () => {
    expect(suggestRoute(81, 2, "double_out")).toEqual(["T19", "D12"]);
    expect(suggestRoute(81, 2, "master_out")).toEqual(["T19", "D12"]);
  });
});

describe("Bust rules", () => {
  it("double_out: rest 1 is bust", () => {
    const result = applyCountdownThrow(31, [seg("T10")], "double_out");
    expect(result.outcome).toBe("bust");
  });

  it("master_out: rest 1 is still bust", () => {
    const result = applyCountdownThrow(31, [seg("T10")], "master_out");
    expect(result.outcome).toBe("bust");
  });

  it("master_out: rest 2 is not bust but restricted", () => {
    const result = applyCountdownThrow(62, [seg("T20")], "master_out");
    expect(result.outcome).toBe("continue");
    expect(result.score).toBe(2);
  });

  it("overthrow is always bust", () => {
    for (const mode of ["double_out", "master_out", "straight_out"] as const) {
      const result = applyCountdownThrow(10, [seg("T20")], mode);
      expect(result.outcome).toBe("bust");
    }
  });

  it("straight_out: no rest-1 bust", () => {
    const result = applyCountdownThrow(31, [seg("T10")], "straight_out");
    expect(result.outcome).toBe("continue");
    expect(result.score).toBe(1);
  });
});
