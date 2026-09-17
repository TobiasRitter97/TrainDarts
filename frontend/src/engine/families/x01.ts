// 1:1-Port von backend/games/x01.py (Phase C des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). x01-Familie:
// "170" (klassisch) und "Pressure 501" (Tobias-Anforderung 17.09.2026).
//
// Pressure 501 ist bewusst KEINE eigene Familie, sondern dieselbe
// Countdown-Logik (In-/Out-Modus, Bust) mit zwei Zusaetzen: einem
// Dart-Limit Z pro Leg und einer Punktwertung. Alle Zusatzwerte
// (Ghost, Punkte, Kennzahlen) werden beim Replay aus dem Event-Log
// mitgerechnet - nichts davon wird ausserhalb des Replays
// fortgeschrieben, damit Korrektur und UNDO automatisch stimmen.
import { applyCountdownThrow, CheckoutMode, CountdownResult, Segment } from "../scoring";

export const STARTING_SCORE = 170;

// Dart-Limit je Level (Pressure 501). "custom" nimmt stattdessen den
// frei eingegebenen Wert (siehe dartLimit()).
export const PRESSURE_LEVEL_DARTS: Record<string, number> = {
  beginner_plus: 42,
  beginner: 36,
  easy: 30,
  medium: 27,
  hard: 24,
  expert: 21,
  pro: 18,
  elite: 15,
};

export const PRESSURE_CUSTOM_MIN = 9;
export const PRESSURE_CUSTOM_MAX = 60;

// Was passiert, wenn das Dart-Limit Z ohne Checkout erreicht ist
// (Tobias-Anforderung 17.09.2026):
//   training - Ziel gilt als verfehlt, das Leg laeuft regulaer weiter
//              bis zum echten Double Out, die Darts zaehlen als Overtime.
//   strict   - das Leg endet sofort ("Challenge failed").
export type PressureGameMode = "training" | "strict";

export function gameMode(settings: Record<string, unknown>): PressureGameMode {
  return settings.gameMode === "strict" ? "strict" : "training";
}

export type PressureLegResult = {
  darts: number;
  checkout: boolean;
  points: number;
  // Restscore beim Abbruch (0, wenn ausgecheckt wurde).
  remaining: number;
  // "Gegen den Ghost gewonnen" = INNERHALB von Z Darts ausgecheckt.
  wonVsGhost: boolean;
  // Darts ueber dem Limit (0, solange das Ziel gehalten wurde).
  overtime: number;
  // Ziel verfehlt - entweder ueberzogen oder gar nicht ausgecheckt.
  failed: boolean;
};

export type X01PlayerState = {
  score: number;
  legsWon: number;
  setsWon: number;
  highestCheckout: number;
  // ---- nur Pressure 501 ----
  dartsThisLeg: number;
  legDone: boolean;
  // Dart-Limit im laufenden Leg ohne Checkout erreicht. Im Training Mode
  // laeuft das Leg danach weiter, deshalb braucht es ein eigenes Flag.
  targetMissed: boolean;
  pressurePoints: number;
  legResults: PressureLegResult[];
  // Gesamtzaehler fuer den 3-Dart-Average ueber alle Legs.
  totalScored: number;
  totalDarts: number;
  // Druck-Kennzahl: Aufnahmen werden danach getrennt, ob der Spieler
  // BEIM START der Aufnahme vor oder hinter dem Ghost lag.
  aheadScored: number;
  aheadDarts: number;
  behindScored: number;
  behindDarts: number;
};

export function createPlayerState(startingScore: number = STARTING_SCORE): X01PlayerState {
  return {
    score: startingScore,
    legsWon: 0,
    setsWon: 0,
    highestCheckout: 0,
    dartsThisLeg: 0,
    legDone: false,
    targetMissed: false,
    pressurePoints: 0,
    legResults: [],
    totalScored: 0,
    totalDarts: 0,
    aheadScored: 0,
    aheadDarts: 0,
    behindScored: 0,
    behindDarts: 0,
  };
}

export function applyThrow(
  playerState: X01PlayerState,
  visitThrows: Segment[],
  settings: Record<string, unknown>
): CountdownResult {
  const checkoutMode = (settings.checkoutMode as CheckoutMode) ?? "double_out";
  return applyCountdownThrow(playerState.score, visitThrows, checkoutMode);
}

// ---------------------------------------------------------------- Pressure 501

// Das Dart-Limit Z. Level und "eigene Dartzahl" sind intern dasselbe -
// gespeichert wird immer nur Z.
export function dartLimit(settings: Record<string, unknown>): number {
  const level = (settings.level as string) ?? "beginner";
  if (level === "custom") {
    const custom = Number(settings.customDarts ?? 36);
    if (!Number.isFinite(custom)) return 36;
    return Math.min(PRESSURE_CUSTOM_MAX, Math.max(PRESSURE_CUSTOM_MIN, Math.round(custom)));
  }
  return PRESSURE_LEVEL_DARTS[level] ?? PRESSURE_LEVEL_DARTS.beginner;
}

// Rein rechnerische Referenzlinie, kein simulierter Wurf.
export function ghostRemaining(startingScore: number, dartLimitValue: number, dartsThrown: number): number {
  return Math.max(0, Math.round(startingScore - (startingScore / dartLimitValue) * dartsThrown));
}

export function targetAverage(startingScore: number, dartLimitValue: number): number {
  return Math.round((startingScore / dartLimitValue) * 3 * 10) / 10;
}

// Punkte fuer ein beendetes Leg, relativ zu Z. Bei kleinem Z koennen
// obere Stufen unerreichbar sein - das ist gewollt, es wird bewusst
// nichts geklemmt.
export function legPoints(dartLimitValue: number, darts: number, checkout: boolean): number {
  if (!checkout) return 0;
  if (darts <= dartLimitValue - 6) return 5;
  if (darts <= dartLimitValue - 3) return 4;
  if (darts <= dartLimitValue) return 3;
  if (darts <= dartLimitValue + 3) return 2;
  if (darts <= dartLimitValue + 6) return 1;
  return 0;
}

function average(scored: number, darts: number): number | null {
  return darts > 0 ? Math.round((scored / darts) * 3 * 10) / 10 : null;
}

// Endauswertung eines Spielers - komplett aus den beim Replay
// mitgefuehrten Werten abgeleitet.
export function pressureSummary(state: X01PlayerState, dartLimitValue: number, totalLegs: number) {
  const legs = state.legResults;
  const aborted = legs.filter((l) => !l.checkout);
  const checkouts = legs.filter((l) => l.checkout);
  const missed = legs.filter((l) => l.failed);
  return {
    points: state.pressurePoints,
    maxPoints: totalLegs * 5,
    average: average(state.totalScored, state.totalDarts),
    legsPlayed: legs.length,
    targetsReached: legs.filter((l) => l.wonVsGhost).length,
    // Nur ueber die verfehlten Legs gemittelt - bei gehaltenem Ziel gibt
    // es keine Overtime, die wuerde den Schnitt sonst nur verwaessern.
    avgOvertime: missed.length > 0 ? Math.round((missed.reduce((s, l) => s + l.overtime, 0) / missed.length) * 10) / 10 : null,
    legsWonVsGhostPercent: legs.length > 0 ? Math.round((legs.filter((l) => l.wonVsGhost).length / legs.length) * 100) : null,
    avgDartsPerLeg: legs.length > 0 ? Math.round((legs.reduce((s, l) => s + l.darts, 0) / legs.length) * 10) / 10 : null,
    checkoutPercent: legs.length > 0 ? Math.round((checkouts.length / legs.length) * 100) : null,
    avgRemainingOnAbort:
      aborted.length > 0 ? Math.round((aborted.reduce((s, l) => s + l.remaining, 0) / aborted.length) * 10) / 10 : null,
    averageAhead: average(state.aheadScored, state.aheadDarts),
    averageBehind: average(state.behindScored, state.behindDarts),
    dartLimit: dartLimitValue,
  };
}
