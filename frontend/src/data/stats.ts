// 1:1-Port von backend/persistence/stats.py (Phase E des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md). Konsequente
// Fortsetzung des Event-Sourcing-Prinzips: Statistiken werden NICHT
// inkrementell fortgeschrieben (fehleranfaellig bei spaeterem Undo/
// Korrektur eines abgeschlossenen Matches), sondern bei jeder Anfrage
// frisch aus den gespeicherten, abgeschlossenen Matches berechnet
// (Replay ueber MatchEngine, dieselbe Quelle wie beim Fortsetzen).
import { GameDefinition, Leaderboard, LeaderboardEntry, ProfileHistoryEntry, ProfileStats } from "../api";
import { MatchEngine, MatchPlayerRef } from "../engine/matchEngine";
import { STATIC_GAMES } from "../staticGames";
import { getProfile } from "./profiles";
import { loadFinishedMatches, loadFinishedMatchesForProfile, StoredMatch } from "./matches";

export { computeConfigHash } from "./configHash";

// Pro Engine-Familie die EINE Kennzahl, die als "persoenliche
// Bestleistung"/Highscore-Metrik zaehlt. Muss ein Feld aus dem
// jeweiligen player_state sein (siehe engine/families/*.ts).
export const PRIMARY_METRIC: Record<string, string> = {
  x01: "highestCheckout",
  checkout_range: "highestLevel",
  catch: "highestLevel",
  random_checkout: "successfulCheckouts",
  target_progression: "bestRun",
  accuracy_progression: "successfulTargets",
  jdc: "totalScore",
  grouping: "totalScore",
};

// Nur diese Familien haben ein "Checkout" im klassischen Sinn
// (Checkout %, Average Checkout Darts, Highest Checkout, Scoring
// Average) - Aufnahmen aus anderen Familien wuerden diese Kennzahlen
// sonst verwaessern.
export const CHECKOUT_FAMILIES = new Set(["x01", "checkout_range", "catch", "random_checkout"]);

function pct(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

function findGame(gameId: string): GameDefinition | null {
  return STATIC_GAMES.find((g) => g.id === gameId) ?? null;
}

function replayMatch(row: StoredMatch): MatchEngine | null {
  const game = findGame(row.gameId);
  if (!game) return null;
  const players: MatchPlayerRef[] = row.playerIds.map((pid) => ({ id: pid, name: pid }));
  try {
    return new MatchEngine(row.id, game, players, row.settings, row.events);
  } catch {
    // Ein einzelnes beschaedigtes/inkompatibles altes Match soll nicht
    // die gesamte Statistik-Abfrage zum Absturz bringen.
    return null;
  }
}

export async function computeProfileStats(profileId: string): Promise<ProfileStats> {
  const rows = await loadFinishedMatchesForProfile(profileId);

  let gamesPlayed = 0;
  let wins = 0;
  let totalDarts = 0;
  let singles = 0;
  let doubles = 0;
  let triples = 0;
  let bulls = 0;
  let misses = 0;
  let scoringPoints = 0;
  let scoringVisits = 0;
  let checkoutsCompleted = 0;
  let checkoutDartsTotal = 0;
  let highestCheckout = 0;
  const perGame: ProfileStats["perGame"] = {};
  const history: ProfileHistoryEntry[] = [];

  for (const row of rows) {
    const engine = replayMatch(row);
    if (!engine || !(profileId in engine.playerStates)) continue;
    const state = engine.playerStates[profileId];
    // Bei Solo-Training ist der einzige Spieler technisch immer
    // "Gewinner" - das zaehlt bewusst NICHT als "Win", sonst waere die
    // Siegquote fuer reines Solo-Training immer 100%.
    const won = engine.players.length > 1 && engine.winnerId === profileId;
    gamesPlayed += 1;
    if (won) wins += 1;

    for (const t of engine.throwLog) {
      if (t.playerId !== profileId) continue;
      const { number, multiplier } = t.segment;
      totalDarts += 1;
      if (!number || !multiplier) misses += 1;
      else if (number === 25) bulls += 1;
      else if (multiplier === 1) singles += 1;
      else if (multiplier === 2) doubles += 1;
      else if (multiplier === 3) triples += 1;
    }

    const isCheckoutFamily = CHECKOUT_FAMILIES.has(engine.familyName);
    if (isCheckoutFamily) {
      for (const v of engine.visitLog) {
        if (v.playerId !== profileId) continue;
        scoringPoints += v.value;
        scoringVisits += 1;
        if (v.outcome === "checkout") {
          checkoutsCompleted += 1;
          checkoutDartsTotal += v.throws.length;
          highestCheckout = Math.max(highestCheckout, v.value);
        }
      }
    }

    const metricName = PRIMARY_METRIC[engine.familyName] ?? null;
    const metricValue = metricName ? (state[metricName] as number | undefined) ?? null : null;
    const bucket = perGame[row.gameId] ?? { gamesPlayed: 0, wins: 0, best: null, metricName, gameName: findGame(row.gameId)?.name ?? row.gameId };
    bucket.gamesPlayed += 1;
    if (won) bucket.wins += 1;
    bucket.metricName = metricName;
    if (metricValue !== null && (bucket.best === null || metricValue > bucket.best)) bucket.best = metricValue;
    perGame[row.gameId] = bucket;

    history.push({
      matchId: row.id,
      gameId: row.gameId,
      gameName: findGame(row.gameId)?.name ?? row.gameId,
      finishedAt: row.finishedAt ?? "",
      won,
      metricName,
      metricValue,
    });
  }

  return {
    gamesPlayed,
    wins,
    winPercent: pct(wins, gamesPlayed),
    accuracy: pct(totalDarts - misses, totalDarts),
    singlePercent: pct(singles, totalDarts),
    doublePercent: pct(doubles, totalDarts),
    triplePercent: pct(triples, totalDarts),
    bullPercent: pct(bulls, totalDarts),
    checkoutPercent: pct(checkoutsCompleted, scoringVisits),
    averageCheckoutDarts: checkoutsCompleted ? Math.round((checkoutDartsTotal / checkoutsCompleted) * 100) / 100 : null,
    highestCheckout,
    scoringAverage: scoringVisits ? Math.round((scoringPoints / scoringVisits) * 100) / 100 : null,
    perGame,
    history: history.slice(-50).reverse(),
  };
}

function formatConfigLabel(game: GameDefinition, settings: Record<string, unknown>): string {
  const labels = new Map(game.settingsSchema.map((f) => [f.key, f.label ?? f.key]));
  const parts = Object.entries(settings)
    .filter(([key]) => labels.has(key))
    .map(([key, value]) => `${labels.get(key)}: ${value}`);
  return parts.length > 0 ? parts.join(", ") : "Standard";
}

export async function computeLeaderboardsForGame(gameId: string): Promise<Leaderboard[]> {
  const game = findGame(gameId);
  if (!game) return [];
  const metricName = PRIMARY_METRIC[game.engineFamily];
  if (!metricName) return [];

  const rows = await loadFinishedMatches(gameId);
  const buckets = new Map<string, { settings: Record<string, unknown>; best: Map<string, number> }>();

  for (const row of rows) {
    const engine = replayMatch(row);
    if (!engine) continue;
    const configHash = row.configHash;
    const bucket = buckets.get(configHash) ?? { settings: row.settings, best: new Map<string, number>() };
    for (const [pid, state] of Object.entries(engine.playerStates)) {
      const value = state[metricName] as number | undefined;
      if (value === undefined || value === null) continue;
      const existing = bucket.best.get(pid);
      if (existing === undefined || value > existing) bucket.best.set(pid, value);
    }
    buckets.set(configHash, bucket);
  }

  const results: Leaderboard[] = [];
  for (const [configHash, bucket] of buckets.entries()) {
    const ranked = [...bucket.best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const entries: LeaderboardEntry[] = [];
    for (const [profileId, value] of ranked) {
      const profile = await getProfile(profileId);
      entries.push({ profileId, name: profile?.name ?? "?", color: profile?.color ?? null, value });
    }
    results.push({ configHash, configLabel: formatConfigLabel(game, bucket.settings), metricName, entries });
  }
  return results;
}
