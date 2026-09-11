// Gemeinsame Typen fuer Profile/Spiele/Match-State (Phase E des
// Client-Rewrites, ~/.claude/plans/agile-brewing-wadler.md). Der
// fruehere REST-Client fuer das Python-Backend ist komplett entfallen -
// siehe data/ (Firestore) und engine/matchEngine.ts (Client-Engine).

export type Profile = {
  id: string;
  name: string;
  initials: string | null;
  color: string | null;
  is_guest: number;
  merged_into_profile_id: string | null;
  archived_at: string | null;
  created_at: string;
};

export type SettingField = {
  key: string;
  label: string;
  type: "toggle" | "select" | "number";
  default: unknown;
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  presets?: number[];
  // "equals" akzeptiert auch ein Array, um ein Feld bei MEHREREN
  // Werten eines anderen Feldes anzuzeigen (z.B. Around the World:
  // "Zielwechsel" nur bei requiredHits 2 ODER 3 relevant).
  showIf?: { key: string; equals: unknown | unknown[] };
  // Kurzer Erklaerungstext unter der Einstellung (Tobias-Feedback
  // 10.09.2026: bei 121 war z.B. der Unterschied zwischen den
  // Safehouse-Optionen nicht selbsterklaerend).
  hint?: string;
};

export type GameDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  engineFamily: string;
  playerRange: [number, number];
  implemented: boolean;
  durationModes: string[];
  settingsSchema: SettingField[];
  // Familienspezifische Zusatzfelder (nur bei manchen Spielen gesetzt) -
  // targets: feste Zielroute (target_progression, z.B. Bob's 27).
  // catchRange: [von, bis] der Zahlenfolge (catch, z.B. Catch 40).
  // dartsPerCheckout: an der GameDefinition fest vorgegeben statt als
  // Einstellung waehlbar (z.B. 60 +/-, siehe engine.py _visitsPerAttempt).
  targets?: string[];
  catchRange?: [number, number];
  dartsPerCheckout?: number;
};

export function defaultSettingsValues(schema: SettingField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of schema) values[field.key] = field.default;
  return values;
}

// Live-Zustand eines Matches, wie ihn MatchEngine.toDict() liefert
// (engine/matchEngine.ts).
export type MatchPlayer = {
  id: string;
  name: string;
  score: number | null;
  legsWon: number | null;
  setsWon: number | null;
  highestCheckout: number | null;
  highestLevel: number | null;
  runsCompleted: number | null;
  totalScore: number | null;
  bestRun: number | null;
  successfulCheckouts: number | null;
  attempts: number | null;
  successfulTargets: number | null;
  totalHits: number | null;
  totalDarts: number | null;
  singles: number | null;
  doubles: number | null;
  triples: number | null;
  perfectTargets: number | null;
  openNumbers: (number | string)[] | null;
  shanghaiCount: number | null;
  phaseScores: Record<string, number> | null;
};

export type MatchThrow = { throwSeq: number; label: string };

export type MatchVisit = { playerId: string; throws: MatchThrow[] };

export type MatchState = {
  matchId: string;
  gameId: string;
  gameName: string;
  engineFamily: string;
  settings: Record<string, unknown>;
  players: MatchPlayer[];
  activePlayerId: string;
  currentVisitThrows: MatchThrow[];
  target: string | null;
  phase: string | null;
  checkoutSuggestion: string[] | null;
  // Nur bei Random Checkout gesetzt: geteilter Versuchs-Zaehler ueber
  // alle Spieler hinweg ("Runde X von Y", total=null bei Endless).
  attemptInfo: { current: number; total: number | null } | null;
  round: number;
  legNumber: number | null;
  setNumber: number | null;
  pendingConfirmation: boolean;
  pendingOutcome: "bust" | "checkout" | "target_done" | "continue" | null;
  history: MatchVisit[];
  canUndo: boolean;
  finished: boolean;
  winnerId: string | null;
  winnerName: string | null;
};

export type Segment = { number: number; multiplier: number };

// SPEC §5/§34/§35: dauerhafte Profil-Statistiken, ueber alle
// abgeschlossenen Matches hinweg berechnet (data/stats.ts).
export type ProfileGameStats = {
  gamesPlayed: number;
  wins: number;
  best: number | null;
  metricName: string | null;
  gameName: string;
};

export type ProfileHistoryEntry = {
  matchId: string;
  gameId: string;
  gameName: string;
  finishedAt: string;
  won: boolean;
  metricName: string | null;
  metricValue: number | null;
};

export type ProfileStats = {
  gamesPlayed: number;
  wins: number;
  winPercent: number | null;
  accuracy: number | null;
  singlePercent: number | null;
  doublePercent: number | null;
  triplePercent: number | null;
  bullPercent: number | null;
  checkoutPercent: number | null;
  averageCheckoutDarts: number | null;
  highestCheckout: number;
  scoringAverage: number | null;
  perGame: Record<string, ProfileGameStats>;
  history: ProfileHistoryEntry[];
};

export type LeaderboardEntry = { profileId: string; name: string; color: string | null; value: number };
export type Leaderboard = { configHash: string; configLabel: string; metricName: string; entries: LeaderboardEntry[] };

