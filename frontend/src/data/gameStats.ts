// Statistik-Bereich (Tobias-Anforderung 17.09.2026). Konsequent nach
// demselben Prinzip wie data/stats.ts: es wird NICHTS inkrementell
// fortgeschrieben und keine zusaetzliche Tabelle angelegt - jede Zahl
// entsteht bei der Anfrage frisch aus dem Replay der abgeschlossenen
// Matches. Das Event-Log bleibt die einzige Quelle der Wahrheit, und
// eine nachtraegliche Korrektur in einem alten Match schlaegt
// automatisch auf die Statistik durch.
//
// REIN LESEND: dieses Modul ruft nur oeffentliche Felder der
// MatchEngine ab (playerStates, visitLog, throwLog, randomTargets,
// segmentTargets). An Engine, Spielregeln oder Event-Log wurde nichts
// geaendert.
import { GameDefinition } from "../api";
import { suggestRoute } from "../engine/checkout";
import { MatchEngine, MatchPlayerRef } from "../engine/matchEngine";
import * as groupingFamily from "../engine/families/grouping";
import * as randomSegmentFamily from "../engine/families/randomSegment";
import * as x01Family from "../engine/families/x01";
import { CheckoutMode, Segment } from "../engine/scoring";
import { STATIC_GAMES } from "../staticGames";
import { loadFinishedMatches, loadFinishedMatchesForProfile, StoredMatch } from "./matches";

export type TimeRange = "7d" | "30d" | "all";

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

// Eine Kennzahl-Zeile in der Detailansicht.
export type StatMetric = { label: string; value: string; hint?: string };

// Eine Quoten-Leiste ("18 von 24 Versuchen"). "value"/"total" statt
// fertigem Prozentwert, damit die Anzeige auch die absolute Zahl
// zeigen kann - bei wenigen Daten ist "1/1 = 100%" sonst irrefuehrend.
export type StatBar = { label: string; value: number; total: number };
export type StatBarGroup = { title: string; note?: string; bars: StatBar[] };

export type MatchRow = { matchId: string; finishedAt: string; result: string };

export type GameDetail = {
  gameId: string;
  gameName: string;
  gamesPlayed: number;
  metrics: StatMetric[];
  barGroups: StatBarGroup[];
  matches: MatchRow[];
  // Was sich mit den gespeicherten Daten NICHT berechnen laesst -
  // wird in der Detailansicht offen ausgewiesen, statt eine Kennzahl
  // zu erfinden.
  missingNote: string | null;
};

export type TrendPoint = { label: string; average: number; games: number };

export type StatsOverview = {
  gamesPlayed: number;
  threeDartAverage: number | null;
  bestLegDarts: number | null;
  checkoutPercent: number | null;
};

export type GameSummary = { gameId: string; gameName: string; gamesPlayed: number; lastPlayed: string };

export type ProfileGameStats = {
  overview: StatsOverview;
  trend: TrendPoint[];
  trendGroupedByDay: boolean;
  games: GameSummary[];
  details: Record<string, GameDetail>;
};

// Nur hier ist ein 3-Dart-Average das, was ein Dartspieler darunter
// versteht: von einem hohen Rest herunterspielen (170, Pressure 501).
//
// Bewusst NICHT dabei sind 121, 60 +/-, Catch 40 und Random Checkout.
// Dort wird auf einen festen Checkout geworfen, und eine verfehlte
// Aufnahme ist ein Bust - also 0 erzielte Punkte. Eine Trainingsrunde
// ohne Treffer haette damit einen Average von 0 und wuerde den
// Gesamtwert und die Verlaufskurve unbrauchbar machen. Diese Spiele
// bewertet stattdessen ihre eigene Erfolgsquote in der Detailansicht.
const AVERAGE_FAMILIES = new Set(["x01"]);

// Ab wie vielen Matches im Zeitraum die Verlaufskurve pro TAG mittelt
// statt einen Punkt pro Spiel zu zeichnen.
const TREND_DAILY_THRESHOLD = 30;

function findGame(gameId: string): GameDefinition | null {
  return STATIC_GAMES.find((g) => g.id === gameId) ?? null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function rangeStart(range: TimeRange): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  const start = new Date();
  start.setDate(start.getDate() - days);
  return start;
}

function inRange(row: StoredMatch, start: Date | null): boolean {
  if (!start) return true;
  if (!row.finishedAt) return false;
  return new Date(row.finishedAt) >= start;
}

type Replayed = { row: StoredMatch; game: GameDefinition; engine: MatchEngine };

function replay(row: StoredMatch): Replayed | null {
  const game = findGame(row.gameId);
  if (!game) return null;
  const players: MatchPlayerRef[] = row.playerIds.map((pid) => ({ id: pid, name: pid }));
  try {
    const engine = new MatchEngine(row.id, game, players, row.settings, row.events);
    return { row, game, engine };
  } catch {
    // Ein einzelnes beschaedigtes/inkompatibles altes Match darf die
    // gesamte Statistik nicht kippen.
    return null;
  }
}

// ---------------------------------------------------------------- Aufnahmen

export type Visit = { throws: Segment[]; outcome: string | null; value: number };

function visitsOf(engine: MatchEngine, profileId: string): Visit[] {
  return engine.visitLog.filter((v) => v.playerId === profileId);
}

// Die tatsaechlich ERZIELTEN Punkte einer Aufnahme. visitLog.value ist
// die Summe der geworfenen Segmentwerte - bei einem Bust zaehlt davon
// nichts, sonst waere jeder Average geschoent.
function scoredPoints(visit: Visit): number {
  return visit.outcome === "bust" ? 0 : visit.value;
}

// ---------------------------------------------------------------- Legs (x01)

// Darts pro Leg fuer die x01-Familie. Ein Leg endet mit einer Aufnahme,
// deren outcome "checkout" ist - alle Darts seit dem letzten Checkout
// gehoeren zu diesem Leg. Nur abgeschlossene Legs zaehlen.
export function finishedLegDarts(visits: Visit[]): number[] {
  const legs: number[] = [];
  let darts = 0;
  for (const v of visits) {
    darts += v.throws.length;
    if (v.outcome === "checkout") {
      legs.push(darts);
      darts = 0;
    }
  }
  return legs;
}

// Echte Checkout-Quote fuer die x01-Familie: wie oft wurde ein Leg
// beendet, wenn beim Start der Aufnahme ueberhaupt ein Finish moeglich
// war? "Beendete Legs / gespielte Legs" waere bei Solo-Training immer
// 100% und damit ohne Aussage.
//
// Ob ein Finish moeglich war, entscheidet suggestRoute() - dieselbe
// Funktion, die im Spiel den Checkout-Vorschlag anzeigt. Damit wird
// die Regel nicht nachgebaut, sondern wiederverwendet.
function checkoutChances(visits: Visit[], startingScore: number, mode: CheckoutMode): { chances: number; taken: number } {
  let remaining = startingScore;
  let chances = 0;
  let taken = 0;
  for (const v of visits) {
    if (suggestRoute(remaining, 3, mode) !== null) {
      chances += 1;
      if (v.outcome === "checkout") taken += 1;
    }
    remaining = v.outcome === "checkout" ? startingScore : remaining - scoredPoints(v);
    if (remaining <= 0) remaining = startingScore;
  }
  return { chances, taken };
}

// ---------------------------------------------------------------- Versuche (Task-Familien)

// Versuche von 121 / 60 +/- / Catch 40 / Random Checkout aus dem
// visitLog rekonstruieren. Die Regel stammt 1:1 aus
// MatchEngine.commitTaskVisit: ein Checkout beendet den Versuch sofort
// erfolgreich, sonst endet er, sobald die erlaubten Aufnahmen
// verbraucht sind. computeAttempts() prueft sich unten selbst gegen die
// Zaehler der Engine, damit die Herleitung nicht unbemerkt abdriftet.
function visitsPerAttempt(game: GameDefinition, settings: Record<string, unknown>, family: string): number {
  const familyDefault = family === "random_checkout" || family === "catch" ? 6 : 9;
  const gameDefault = game.dartsPerCheckout ?? familyDefault;
  const darts = Number(settings.dartsPerCheckout ?? gameDefault);
  return Math.max(1, Math.floor(darts / 3));
}

export type Attempt = { success: boolean; visits: number };

export function reconstructAttempts(visits: Visit[], perAttempt: number): Attempt[] {
  const attempts: Attempt[] = [];
  let used = 0;
  for (const v of visits) {
    if (v.outcome === "checkout") {
      attempts.push({ success: true, visits: used + 1 });
      used = 0;
      continue;
    }
    used += 1;
    if (used >= perAttempt) {
      attempts.push({ success: false, visits: used });
      used = 0;
    }
  }
  return attempts;
}

// ---------------------------------------------------------------- Detailansichten

type DetailBuilder = (runs: Replayed[], profileId: string) => { metrics: StatMetric[]; barGroups: StatBarGroup[]; missingNote: string | null };

function x01Detail(runs: Replayed[], profileId: string) {
  const pressure = runs.length > 0 && Boolean(runs[0].game.pressureMode);
  const startingScore = Number(runs[0]?.game.startingScore ?? 170);

  let points = 0;
  let darts = 0;
  const legDarts: number[] = [];
  let checkoutChancesTotal = 0;
  let checkoutsTaken = 0;
  let highestCheckout = 0;
  // Aufnahme-Verteilung. Ein 180er ist aus 170 Rest nie moeglich,
  // deshalb faellt die Stufe bei "170" weg.
  const buckets = [
    { label: "60+", min: 60 },
    { label: "100+", min: 100 },
    { label: "140+", min: 140 },
    { label: "180", min: 180 },
  ].filter((b) => b.min <= startingScore);
  const bucketCounts = buckets.map(() => 0);
  let scoringVisits = 0;

  let targetsReached = 0;
  let legsWithResult = 0;
  let overtimeSum = 0;
  let overtimeLegs = 0;
  let pressurePoints = 0;
  let pressureMaxPoints = 0;

  for (const { engine, row } of runs) {
    const visits = visitsOf(engine, profileId);
    for (const v of visits) {
      const scored = scoredPoints(v);
      points += scored;
      darts += v.throws.length;
      if (v.outcome === "checkout") highestCheckout = Math.max(highestCheckout, v.value);
      // Die Verteilung beschreibt Scoring-Aufnahmen: nur volle
      // 3-Dart-Aufnahmen, die kein Checkout waren.
      if (v.throws.length === 3 && v.outcome !== "checkout") {
        scoringVisits += 1;
        buckets.forEach((b, i) => {
          if (scored >= b.min) bucketCounts[i] += 1;
        });
      }
    }
    legDarts.push(...finishedLegDarts(visits));
    const chance = checkoutChances(visits, startingScore, (row.settings.checkoutMode as CheckoutMode) ?? "double_out");
    checkoutChancesTotal += chance.chances;
    checkoutsTaken += chance.taken;

    if (pressure) {
      const state = engine.playerStates[profileId] as x01Family.X01PlayerState | undefined;
      const results = state?.legResults ?? [];
      legsWithResult += results.length;
      targetsReached += results.filter((l) => l.wonVsGhost).length;
      for (const l of results) {
        if (l.overtime > 0) {
          overtimeSum += l.overtime;
          overtimeLegs += 1;
        }
      }
      pressurePoints += state?.pressurePoints ?? 0;
      pressureMaxPoints += Math.max(1, Number(row.settings.numberOfLegs ?? 10)) * 5;
    }
  }

  const metrics: StatMetric[] = [
    { label: "3-dart average", value: darts > 0 ? String(round1((points / darts) * 3)) : "—" },
    {
      label: "Checkout rate",
      value: checkoutChancesTotal > 0 ? `${pct(checkoutsTaken, checkoutChancesTotal)}%` : "—",
      hint: `${checkoutsTaken} of ${checkoutChancesTotal} visits that started on a finish`,
    },
    {
      label: "Ø darts per leg",
      value: legDarts.length > 0 ? String(round1(legDarts.reduce((s, d) => s + d, 0) / legDarts.length)) : "—",
    },
    { label: "Best leg", value: legDarts.length > 0 ? `${Math.min(...legDarts)} darts` : "—" },
    { label: "Highest checkout", value: highestCheckout > 0 ? String(highestCheckout) : "—" },
  ];

  if (pressure) {
    metrics.push(
      {
        label: "Target reached",
        value: legsWithResult > 0 ? `${targetsReached} of ${legsWithResult}` : "—",
        hint: "Legs finished within the dart limit",
      },
      {
        label: "Ø overtime",
        value: overtimeLegs > 0 ? `+${round1(overtimeSum / overtimeLegs)} darts` : "—",
        hint: overtimeLegs > 0 ? `over ${overtimeLegs} legs past the limit` : "no leg went past the limit",
      },
      { label: "Points", value: pressureMaxPoints > 0 ? `${pressurePoints} / ${pressureMaxPoints}` : "—" }
    );
  }

  const barGroups: StatBarGroup[] = [];
  if (scoringVisits > 0) {
    barGroups.push({
      title: "Scoring visits",
      note: `Share of the ${scoringVisits} full 3-dart scoring visits${
        startingScore < 180 ? " · a 180 is impossible from " + startingScore : ""
      }`,
      bars: buckets.map((b, i) => ({ label: b.label, value: bucketCounts[i], total: scoringVisits })),
    });
  }

  return { metrics, barGroups, missingNote: null };
}

function targetProgressionDetail(runs: Replayed[], profileId: string) {
  // Bob's 27: pro Ziel genau EINE Aufnahme, Ziele in fester Reihenfolge
  // (D1..D20, Bull). Damit laesst sich jede Aufnahme eindeutig ihrem
  // Doppel zuordnen, ohne dass die Engine das speichern muesste.
  const perTarget = new Map<string, { hitVisits: number; visits: number; darts: number; hits: number }>();
  const runScores: number[] = [];

  for (const { engine } of runs) {
    const state = engine.playerStates[profileId] as { targets?: string[]; totalScore?: number; bestRun?: number | null } | undefined;
    const targets = state?.targets ?? [];
    if (targets.length === 0) continue;
    const visits = visitsOf(engine, profileId);
    visits.forEach((v, i) => {
      const label = targets[i % targets.length];
      const entry = perTarget.get(label) ?? { hitVisits: 0, visits: 0, darts: 0, hits: 0 };
      const hits = v.throws.filter((t) =>
        label === "BULL" ? t.number === 25 && t.multiplier === 2 : t.number === parseInt(label.slice(1), 10) && t.multiplier === 2
      ).length;
      entry.visits += 1;
      entry.darts += v.throws.length;
      entry.hits += hits;
      if (hits > 0) entry.hitVisits += 1;
      perTarget.set(label, entry);
    });
    if (typeof state?.totalScore === "number") runScores.push(state.totalScore);
  }

  const allDarts = [...perTarget.values()].reduce((s, e) => s + e.darts, 0);
  const allHits = [...perTarget.values()].reduce((s, e) => s + e.hits, 0);

  const metrics: StatMetric[] = [
    {
      label: "Ø final score",
      value: runScores.length > 0 ? String(round1(runScores.reduce((s, v) => s + v, 0) / runScores.length)) : "—",
    },
    { label: "Best score", value: runScores.length > 0 ? String(Math.max(...runScores)) : "—" },
    { label: "Worst score", value: runScores.length > 0 ? String(Math.min(...runScores)) : "—" },
    {
      label: "Hit rate",
      value: allDarts > 0 ? `${pct(allHits, allDarts)}%` : "—",
      hint: `${allHits} of ${allDarts} darts on the target double`,
    },
  ];

  // Sortiert nach Trefferquote aufsteigend: die schwaechsten Doppel
  // stehen oben, genau das ist die Trainingsinformation.
  const ordered = [...perTarget.entries()]
    .filter(([, e]) => e.darts > 0)
    .sort((a, b) => a[1].hits / a[1].darts - b[1].hits / b[1].darts);

  const barGroups: StatBarGroup[] = [];
  if (ordered.length > 0) {
    barGroups.push({
      title: "Hit rate per double — weakest first",
      note: "Share of darts that hit the target double.",
      bars: ordered.map(([label, e]) => ({ label, value: e.hits, total: e.darts })),
    });
  }

  return { metrics, barGroups, missingNote: null };
}

function randomCheckoutDetail(runs: Replayed[], profileId: string) {
  // Die Checkout-Werte stehen als gemeinsame Zufallssequenz im
  // MATCH_STARTED-Event (engine.randomTargets). Versuch i gehoert zu
  // randomTargets[i] - dadurch laesst sich die Erfolgsquote nach
  // Restpunktzahl gruppieren.
  const ranges = [
    { label: "2–40", min: 2, max: 40 },
    { label: "41–60", min: 41, max: 60 },
    { label: "61–80", min: 61, max: 80 },
    { label: "81–100", min: 81, max: 100 },
    { label: "101–130", min: 101, max: 130 },
    { label: "131–170", min: 131, max: 170 },
  ];
  const byRange = ranges.map(() => ({ ok: 0, total: 0 }));
  const byValue = new Map<number, { ok: number; total: number }>();
  let succeeded = 0;
  let attemptCount = 0;
  let mismatch = false;

  for (const { engine, game, row } of runs) {
    const visits = visitsOf(engine, profileId);
    const attempts = reconstructAttempts(visits, visitsPerAttempt(game, row.settings, "random_checkout"));
    const state = engine.playerStates[profileId] as { attempts?: number; successfulCheckouts?: number } | undefined;
    // Selbstpruefung: weicht die Herleitung von den Zaehlern der Engine
    // ab, wird die Aufschluesselung lieber weggelassen als falsch
    // angezeigt.
    if (state?.attempts !== undefined && state.attempts !== attempts.length) mismatch = true;
    attempts.forEach((a, i) => {
      const value = engine.randomTargets[i];
      attemptCount += 1;
      if (a.success) succeeded += 1;
      if (value === undefined) return;
      const slot = byValue.get(value) ?? { ok: 0, total: 0 };
      slot.total += 1;
      if (a.success) slot.ok += 1;
      byValue.set(value, slot);
      const ri = ranges.findIndex((r) => value >= r.min && value <= r.max);
      if (ri >= 0) {
        byRange[ri].total += 1;
        if (a.success) byRange[ri].ok += 1;
      }
    });
  }

  const metrics: StatMetric[] = [
    {
      label: "Success rate",
      value: attemptCount > 0 ? `${pct(succeeded, attemptCount)}%` : "—",
      hint: `${succeeded} of ${attemptCount} checkouts`,
    },
    { label: "Attempts", value: String(attemptCount) },
  ];

  const barGroups: StatBarGroup[] = [];
  if (!mismatch && byRange.some((r) => r.total > 0)) {
    barGroups.push({
      title: "Success rate by checkout range",
      bars: ranges.map((r, i) => ({ label: r.label, value: byRange[i].ok, total: byRange[i].total })).filter((b) => b.total > 0),
    });
    // Die haertesten Einzel-Checkouts: erst nach Quote, bei Gleichstand
    // der haeufiger versuchte zuerst.
    const hardest = [...byValue.entries()]
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total || b[1].total - a[1].total)
      .slice(0, 8);
    if (hardest.length > 0) {
      barGroups.push({
        title: "Toughest checkouts",
        note: "Lowest success rate first.",
        bars: hardest.map(([value, v]) => ({ label: String(value), value: v.ok, total: v.total })),
      });
    }
  }

  return {
    metrics,
    barGroups,
    missingNote: mismatch
      ? "Breakdown by checkout value skipped: the reconstructed attempts did not match the engine's own counter for at least one match."
      : null,
  };
}

function taskFamilyDetail(runs: Replayed[], profileId: string) {
  // 121, 60 +/-, Catch 40: die Engine fuehrt Versuche und erfolgreiche
  // Checkouts selbst mit - hier reicht der Endstand.
  let attempts = 0;
  let successes = 0;
  let highestLevel = 0;
  let visitsOnSuccess = 0;

  for (const { engine, game, row } of runs) {
    const state = engine.playerStates[profileId] as
      | { attempts?: number; successfulCheckouts?: number; highestLevel?: number; level?: number }
      | undefined;
    attempts += state?.attempts ?? 0;
    successes += state?.successfulCheckouts ?? 0;
    highestLevel = Math.max(highestLevel, state?.highestLevel ?? state?.level ?? 0);
    const rebuilt = reconstructAttempts(visitsOf(engine, profileId), visitsPerAttempt(game, row.settings, engine.familyName));
    visitsOnSuccess += rebuilt.filter((a) => a.success).reduce((s, a) => s + a.visits, 0);
  }

  const metrics: StatMetric[] = [
    {
      label: "Success rate",
      value: attempts > 0 ? `${pct(successes, attempts)}%` : "—",
      hint: `${successes} of ${attempts} attempts`,
    },
    {
      label: "Ø visits per success",
      value: successes > 0 ? String(round1(visitsOnSuccess / successes)) : "—",
      hint: "Visits needed for a successful checkout",
    },
    { label: "Highest level", value: highestLevel > 0 ? String(highestLevel) : "—" },
  ];

  return { metrics, barGroups: [], missingNote: null };
}

function randomSegmentDetail(runs: Replayed[], profileId: string) {
  const groupLabels: Record<string, string> = {
    large_single: "Large Singles",
    small_single: "Small Singles",
    double: "Doubles",
    triple: "Triples",
    bull: "Bull",
  };
  const byGroup = new Map<string, { ok: number; total: number }>();
  const byLabel = new Map<string, { ok: number; total: number }>();
  let hit = 0;
  let total = 0;
  let dartsOnHit = 0;

  for (const { engine } of runs) {
    const state = engine.playerStates[profileId] as { results?: randomSegmentFamily.SegmentResult[] } | undefined;
    for (const r of state?.results ?? []) {
      total += 1;
      if (r.hit) {
        hit += 1;
        dartsOnHit += r.dartsUsed;
      }
      const g = byGroup.get(r.group) ?? { ok: 0, total: 0 };
      g.total += 1;
      if (r.hit) g.ok += 1;
      byGroup.set(r.group, g);
      const l = byLabel.get(r.label) ?? { ok: 0, total: 0 };
      l.total += 1;
      if (r.hit) l.ok += 1;
      byLabel.set(r.label, l);
    }
  }

  const metrics: StatMetric[] = [
    { label: "Hit rate", value: total > 0 ? `${pct(hit, total)}%` : "—", hint: `${hit} of ${total} targets` },
    { label: "Ø darts per hit target", value: hit > 0 ? String(round1(dartsOnHit / hit)) : "—" },
  ];

  const barGroups: StatBarGroup[] = [];
  if (byGroup.size > 0) {
    barGroups.push({
      title: "Hit rate per segment type",
      bars: [...byGroup.entries()]
        .sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total)
        .map(([g, v]) => ({ label: groupLabels[g] ?? g, value: v.ok, total: v.total })),
    });
  }
  const weakest = [...byLabel.entries()]
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => a[1].ok / a[1].total - b[1].ok / b[1].total || b[1].total - a[1].total)
    .slice(0, 8);
  if (weakest.length > 0) {
    barGroups.push({ title: "Weakest segments", note: "Lowest hit rate first.", bars: weakest.map(([label, v]) => ({ label, value: v.ok, total: v.total })) });
  }

  return { metrics, barGroups, missingNote: null };
}

function accuracyProgressionDetail(runs: Replayed[], profileId: string) {
  let successfulTargets = 0;
  let totalHits = 0;
  let totalDarts = 0;
  let singles = 0;
  let doubles = 0;
  let triples = 0;
  let perfectTargets = 0;

  for (const { engine } of runs) {
    const s = engine.playerStates[profileId] as Record<string, number> | undefined;
    if (!s) continue;
    successfulTargets += s.successfulTargets ?? 0;
    totalHits += s.totalHits ?? 0;
    totalDarts += s.totalDarts ?? 0;
    singles += s.singles ?? 0;
    doubles += s.doubles ?? 0;
    triples += s.triples ?? 0;
    perfectTargets += s.perfectTargets ?? 0;
  }

  return {
    metrics: [
      { label: "Targets completed", value: String(successfulTargets) },
      { label: "Hit rate", value: totalDarts > 0 ? `${pct(totalHits, totalDarts)}%` : "—", hint: `${totalHits} of ${totalDarts} darts` },
      { label: "Perfect targets", value: String(perfectTargets), hint: "All required hits in one visit" },
    ],
    barGroups:
      singles + doubles + triples > 0
        ? [
            {
              title: "Hit type",
              bars: [
                { label: "Singles", value: singles, total: totalHits },
                { label: "Doubles", value: doubles, total: totalHits },
                { label: "Triples", value: triples, total: totalHits },
              ],
            },
          ]
        : [],
    missingNote: null,
  };
}

function jdcDetail(runs: Replayed[], profileId: string) {
  let totalScore = 0;
  let best = 0;
  let shanghai = 0;
  let runsCompleted = 0;
  let shanghai1 = 0;
  let doublesPhase = 0;
  let shanghai2 = 0;
  let phaseRuns = 0;

  for (const { engine } of runs) {
    const s = engine.playerStates[profileId] as
      | { totalScore?: number; bestRun?: number | null; shanghaiCount?: number; runsCompleted?: number; phaseScores?: Record<string, number> }
      | undefined;
    if (!s) continue;
    totalScore += s.totalScore ?? 0;
    best = Math.max(best, s.bestRun ?? 0);
    shanghai += s.shanghaiCount ?? 0;
    runsCompleted += s.runsCompleted ?? 0;
    if (s.phaseScores) {
      shanghai1 += s.phaseScores.shanghai1 ?? 0;
      doublesPhase += s.phaseScores.doubles ?? 0;
      shanghai2 += s.phaseScores.shanghai2 ?? 0;
      phaseRuns += 1;
    }
  }

  const phaseTotal = shanghai1 + doublesPhase + shanghai2;
  return {
    metrics: [
      { label: "Best run", value: best > 0 ? String(best) : "—" },
      { label: "Ø run score", value: runsCompleted > 0 ? String(round1(totalScore / runsCompleted)) : "—" },
      { label: "Shanghais", value: String(shanghai) },
      { label: "Runs completed", value: String(runsCompleted) },
    ],
    barGroups:
      phaseTotal > 0
        ? [
            {
              title: "Points per phase",
              note: `Across ${phaseRuns} match${phaseRuns === 1 ? "" : "es"} — share of total points scored.`,
              bars: [
                { label: "Shanghai 1", value: shanghai1, total: phaseTotal },
                { label: "Doubles", value: doublesPhase, total: phaseTotal },
                { label: "Shanghai 2", value: shanghai2, total: phaseTotal },
              ],
            },
          ]
        : [],
    missingNote: null,
  };
}

function groupingDetail(runs: Replayed[], profileId: string) {
  const allMm: number[] = [];
  let best: number | null = null;
  let worst: number | null = null;
  let roundsWithoutCoords = 0;

  for (const { engine } of runs) {
    const s = engine.playerStates[profileId] as groupingFamily.GroupingPlayerState | undefined;
    for (const r of s?.rounds ?? []) {
      if (r.mm === null) {
        roundsWithoutCoords += 1;
        continue;
      }
      allMm.push(r.mm);
      if (best === null || r.mm < best) best = r.mm;
      if (worst === null || r.mm > worst) worst = r.mm;
    }
  }

  return {
    metrics: [
      { label: "Ø spread", value: allMm.length > 0 ? `${round1(allMm.reduce((s, v) => s + v, 0) / allMm.length)} mm` : "—" },
      { label: "Tightest round", value: best !== null ? `${round1(best)} mm` : "—" },
      { label: "Widest round", value: worst !== null ? `${round1(worst)} mm` : "—" },
      { label: "Rounds measured", value: String(allMm.length) },
    ],
    barGroups: [],
    missingNote:
      roundsWithoutCoords > 0
        ? `${roundsWithoutCoords} round${roundsWithoutCoords === 1 ? "" : "s"} could not be measured — fewer than two darts had real board coordinates.`
        : null,
  };
}

const DETAIL_BUILDERS: Record<string, DetailBuilder> = {
  x01: x01Detail,
  target_progression: targetProgressionDetail,
  random_checkout: randomCheckoutDetail,
  checkout_range: taskFamilyDetail,
  catch: taskFamilyDetail,
  random_segment: randomSegmentDetail,
  accuracy_progression: accuracyProgressionDetail,
  jdc: jdcDetail,
  grouping: groupingDetail,
};

// Fuer Spiele ohne eigene Auswertung: mindestens Anzahl, Datum,
// Ergebnis (die Match-Liste liefert Datum und Ergebnis ohnehin).
function fallbackDetail(runs: Replayed[], profileId: string) {
  let darts = 0;
  for (const { engine } of runs) darts += engine.throwLog.filter((t) => t.playerId === profileId).length;
  return {
    metrics: [
      { label: "Matches", value: String(runs.length) },
      { label: "Darts thrown", value: String(darts) },
    ],
    barGroups: [] as StatBarGroup[],
    missingNote: "No game-specific metric available for this game yet.",
  };
}

// Kurzes Ergebnis fuer die Match-Liste - je Familie die Zahl, die das
// Spiel tatsaechlich bewertet.
function resultText(engine: MatchEngine, game: GameDefinition, profileId: string): string {
  const s = engine.playerStates[profileId] as Record<string, unknown> | undefined;
  if (!s) return "—";
  if (game.pressureMode) {
    const state = s as unknown as x01Family.X01PlayerState;
    return `${state.pressurePoints} pts`;
  }
  switch (engine.familyName) {
    case "x01":
      return `${s.legsWon ?? 0} legs`;
    case "target_progression":
      return `${s.totalScore ?? 0} points`;
    case "jdc":
      return `${s.totalScore ?? 0} points`;
    case "grouping":
      return `${s.totalScore ?? 0} points`;
    case "random_checkout":
      return `${s.successfulCheckouts ?? 0}/${s.attempts ?? 0} checkouts`;
    case "checkout_range":
    case "catch":
      return `Level ${s.highestLevel ?? s.level ?? 0}`;
    case "random_segment":
      return `${s.hitTargets ?? 0} targets`;
    case "accuracy_progression":
      return `${s.successfulTargets ?? 0} targets`;
    default:
      return "—";
  }
}

// ---------------------------------------------------------------- Einstieg

export async function computeGameStats(profileId: string, range: TimeRange): Promise<ProfileGameStats> {
  const start = rangeStart(range);
  const rows = (await loadFinishedMatchesForProfile(profileId)).filter((r) => inRange(r, start));

  const runs: Replayed[] = [];
  for (const row of rows) {
    const replayed = replay(row);
    if (replayed && profileId in replayed.engine.playerStates) runs.push(replayed);
  }

  // ---- Uebersicht
  let points = 0;
  let darts = 0;
  let legsFinished = 0;
  let legsPlayed = 0;
  let taskSuccess = 0;
  let taskAttempts = 0;
  const legDarts: number[] = [];

  for (const { engine, game, row } of runs) {
    const visits = visitsOf(engine, profileId);
    if (AVERAGE_FAMILIES.has(engine.familyName)) {
      for (const v of visits) {
        points += scoredPoints(v);
        darts += v.throws.length;
      }
    }
    if (engine.familyName === "x01") {
      legDarts.push(...finishedLegDarts(visits));
      const chance = checkoutChances(
        visits,
        Number(game.startingScore ?? 170),
        (row.settings.checkoutMode as CheckoutMode) ?? "double_out"
      );
      legsFinished += chance.taken;
      legsPlayed += chance.chances;
    } else if (["checkout_range", "catch", "random_checkout"].includes(engine.familyName)) {
      const s = engine.playerStates[profileId] as { attempts?: number; successfulCheckouts?: number };
      taskAttempts += s.attempts ?? 0;
      taskSuccess += s.successfulCheckouts ?? 0;
    }
  }

  const overview: StatsOverview = {
    gamesPlayed: runs.length,
    threeDartAverage: darts > 0 ? round1((points / darts) * 3) : null,
    bestLegDarts: legDarts.length > 0 ? Math.min(...legDarts) : null,
    checkoutPercent: pct(legsFinished + taskSuccess, legsPlayed + taskAttempts),
  };

  // ---- Verlauf: ein Punkt pro Spiel, bei vielen Spielen pro Tag gemittelt
  const scoringRuns = runs.filter((r) => AVERAGE_FAMILIES.has(r.engine.familyName));
  const perMatch = scoringRuns
    .map(({ engine, row }) => {
      const visits = visitsOf(engine, profileId);
      const p = visits.reduce((s, v) => s + scoredPoints(v), 0);
      const d = visits.reduce((s, v) => s + v.throws.length, 0);
      return d > 0 ? { at: row.finishedAt ?? "", average: round1((p / d) * 3) } : null;
    })
    .filter((v): v is { at: string; average: number } => v !== null);

  const groupedByDay = perMatch.length > TREND_DAILY_THRESHOLD;
  let trend: TrendPoint[];
  if (groupedByDay) {
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const m of perMatch) {
      const day = m.at.slice(0, 10);
      const slot = byDay.get(day) ?? { sum: 0, n: 0 };
      slot.sum += m.average;
      slot.n += 1;
      byDay.set(day, slot);
    }
    trend = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ label: formatDay(day), average: round1(v.sum / v.n), games: v.n }));
  } else {
    trend = perMatch.map((m) => ({ label: formatDay(m.at.slice(0, 10)), average: m.average, games: 1 }));
  }

  // ---- Pro Spiel
  const byGame = new Map<string, Replayed[]>();
  for (const r of runs) {
    const list = byGame.get(r.row.gameId) ?? [];
    list.push(r);
    byGame.set(r.row.gameId, list);
  }

  const games: GameSummary[] = [];
  const details: Record<string, GameDetail> = {};

  for (const [gameId, list] of byGame.entries()) {
    const game = list[0].game;
    const builder = DETAIL_BUILDERS[game.engineFamily] ?? fallbackDetail;
    const built = builder(list, profileId);
    const matches: MatchRow[] = list
      .map(({ row, engine, game: g }) => ({
        matchId: row.id,
        finishedAt: row.finishedAt ?? "",
        result: resultText(engine, g, profileId),
      }))
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));

    details[gameId] = {
      gameId,
      gameName: game.name,
      gamesPlayed: list.length,
      metrics: built.metrics,
      barGroups: built.barGroups,
      matches,
      missingNote: built.missingNote,
    };
    games.push({
      gameId,
      gameName: game.name,
      gamesPlayed: list.length,
      lastPlayed: matches[0]?.finishedAt ?? "",
    });
  }

  games.sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));

  return { overview, trend, trendGroupedByDay: groupedByDay, games, details };
}

// Welches Profil zuletzt gespielt hat. profiles.listProfiles() sortiert
// nach ERSTELLDATUM, taugt als "zuletzt genutzt" also nicht - die
// Antwort steht stattdessen im juengsten abgeschlossenen Match.
// Bewusst rein lesend, es wird dafuer nichts zusaetzlich gespeichert.
export async function lastUsedProfileId(knownProfileIds: string[]): Promise<string | null> {
  try {
    const rows = await loadFinishedMatches();
    // loadFinishedMatches() sortiert aufsteigend nach finishedAt.
    for (let i = rows.length - 1; i >= 0; i--) {
      const hit = rows[i].playerIds.find((pid) => knownProfileIds.includes(pid));
      if (hit) return hit;
    }
  } catch {
    // Kein Netz/keine Daten - dann entscheidet der Aufrufer.
  }
  return null;
}

export function formatDay(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y?.slice(2) ?? ""}`;
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getFullYear()
  ).slice(2)} · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
