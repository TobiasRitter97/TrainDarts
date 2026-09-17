import { MatchState, MatchPlayer } from "../api";
import "./ResultScreen.css";

type Props = {
  match: MatchState;
  onRematch: () => void;
  onExit: () => void;
};

// SPEC §33, erste einfache Version: Rangliste + je Spieler die
// vorhandenen Kennzahlen (je nach Spiel unterschiedlich - Sets/Legs
// bei 170, Gesamtscore bei Bob's 27, erfolgreiche Checkouts bei
// Random Checkout). REMATCH und GAME HUB genuegen fuer den ersten
// Durchstich; SAME/CHANGE PLAYERS und OTHER GAME folgen spaeter.
function rankValue(p: MatchPlayer, setsEnabled: boolean): number {
  if (p.pressureSummary !== null) return p.pressureSummary.points;
  if (setsEnabled) return (p.setsWon ?? 0) * 1000 + (p.legsWon ?? 0);
  // 121: hoechstes erreichtes Level entscheidet, bei Gleichstand
  // erfolgreiche Checkouts (SPEC §18).
  if (p.highestLevel !== null) return p.highestLevel * 1000 + (p.successfulCheckouts ?? 0);
  // Around the World: meiste erfolgreiche Targets, bei Gleichstand
  // mehr Treffer insgesamt (SPEC §24).
  if (p.successfulTargets !== null) return p.successfulTargets * 1000 + (p.totalHits ?? 0);
  return p.legsWon ?? p.totalScore ?? p.successfulCheckouts ?? p.score ?? 0;
}

// Die eine Kennzahl, die in der Rangliste hinter dem Namen steht - je
// nach Spiel unterschiedlich. Frueher eine verschachtelte Kette aus
// JSX-Bedingungen; als Funktion ist die Reihenfolge (spezifisch vor
// allgemein) deutlich leichter zu lesen und zu erweitern.
function resultValueText(p: MatchPlayer, setsEnabled: boolean): string {
  if (setsEnabled) return `${p.setsWon} Sets (${p.legsWon} Legs)`;
  if (p.pressureSummary !== null) return `${p.pressureSummary.points}/${p.pressureSummary.maxPoints} points`;
  if (p.segmentResults !== null) {
    const hits = p.segmentResults.filter((r) => r.hit).length;
    return `${hits}/${p.segmentTotalTargets ?? p.segmentResults.length} Targets`;
  }
  if (p.highestLevel !== null) return `Level ${p.highestLevel} (${p.successfulCheckouts}/${p.attempts})`;
  if (p.successfulTargets !== null) return `${p.successfulTargets} Targets (${p.totalHits} hits)`;
  if (p.legsWon !== null) return `${p.legsWon} Legs`;
  if (p.totalScore !== null) return `${p.totalScore} points`;
  if (p.successfulCheckouts !== null) return `${p.successfulCheckouts}/${p.attempts} Checkouts`;
  return "";
}

export function ResultScreen({ match, onRematch, onExit }: Props) {
  const setsEnabled = Boolean(match.settings?.setsEnabled);
  const ranked = [...match.players].sort((a, b) => rankValue(b, setsEnabled) - rankValue(a, setsEnabled));

  return (
    <div className="result-screen">
      <h1 className="screen-title">🏆 RESULTS</h1>
      <p className="screen-note">
        {match.gameName}
        {match.pressureInfo &&
          ` · ${match.pressureInfo.dartLimit} darts · target average ${match.pressureInfo.targetAverage} · ${
            match.pressureInfo.outMode === "master_out" ? "Master Out" : "Double Out"
          } · ${match.pressureInfo.gameMode === "strict" ? "Strict Mode" : "Training Mode"}`}
      </p>

      <ol className="result-list">
        {ranked.map((p, i) => (
          <li key={p.id} className={`result-row ${p.id === match.winnerId ? "winner" : ""}`}>
            <span className="result-rank">{i + 1}.</span>
            <span className="result-name">{p.name}</span>
            <span className="result-value">{resultValueText(p, setsEnabled)}</span>
          </li>
        ))}
      </ol>

      <div className="result-stats">
        {ranked.map((p) => (
          <div key={p.id} className="result-stat-card">
            <div className="result-stat-name">{p.name}</div>
            {p.highestCheckout ? <div className="result-stat-row">Highest Checkout: <b>{p.highestCheckout}</b></div> : null}
            {p.highestLevel !== null ? <div className="result-stat-row">Highest Level: <b>{p.highestLevel}</b></div> : null}
            {p.bestRun !== null && p.bestRun !== undefined ? <div className="result-stat-row">Best Run: <b>{p.bestRun}</b></div> : null}
            {p.successfulCheckouts !== null && p.attempts ? (
              <div className="result-stat-row">
                Checkout %: <b>{Math.round((p.successfulCheckouts / p.attempts) * 100)}%</b>
              </div>
            ) : null}
            {p.successfulTargets !== null ? (
              <>
                <div className="result-stat-row">Successful Targets: <b>{p.successfulTargets}</b></div>
                <div className="result-stat-row">
                  Hit Rate: <b>{p.totalDarts ? Math.round(((p.totalHits ?? 0) / p.totalDarts) * 100) : 0}%</b>
                </div>
                <div className="result-stat-row">
                  Singles/Doubles/Triples: <b>{p.singles}/{p.doubles}/{p.triples}</b>
                </div>
                <div className="result-stat-row">Perfect Targets: <b>{p.perfectTargets}</b></div>
              </>
            ) : null}
            {p.groupingRounds !== null && p.bestGroupingRoundIndex !== null ? (
              <div className="result-stat-row">
                Best Grouping: Round <b>{p.bestGroupingRoundIndex + 1}</b> (
                {p.groupingRounds[p.bestGroupingRoundIndex].mm?.toFixed(1)} mm)
              </div>
            ) : null}
            {p.segmentResults !== null ? <SegmentSummary player={p} /> : null}
            {p.pressureSummary !== null ? (
              <PressureSummary summary={p.pressureSummary} gameMode={match.pressureInfo?.gameMode ?? "training"} />
            ) : null}
          </div>
        ))}
      </div>

      <div className="result-actions">
        <button className="btn-primary" onClick={onRematch}>
          REMATCH
        </button>
        <button className="btn-secondary" onClick={onExit}>
          GAME HUB
        </button>
      </div>
    </div>
  );
}

const SEGMENT_GROUP_LABELS: Record<string, string> = {
  large_single: "Large Singles",
  small_single: "Small Singles",
  double: "Doubles",
  triple: "Triples",
  bull: "Bull",
};

// Endauswertung fuer Random Segment Training (Tobias-Anforderung
// 16.09.2026): Gesamtquote, Ø Darts pro getroffenem Ziel, Quote je
// Gruppe und die Liste der verfehlten Ziele. Alles aus segmentResults
// abgeleitet - die Engine liefert einen Eintrag pro abgeschlossenem Ziel.
function SegmentSummary({ player }: { player: MatchPlayer }) {
  const results = player.segmentResults ?? [];
  if (results.length === 0) return null;

  const hits = results.filter((r) => r.hit);
  const total = player.segmentTotalTargets ?? results.length;
  const hitRate = Math.round((hits.length / total) * 100);
  const dartsPerHit = hits.length > 0 ? (hits.reduce((sum, r) => sum + r.dartsUsed, 0) / hits.length).toFixed(1) : "—";

  const groups = Array.from(new Set(results.map((r) => r.group)));
  const missed = results.filter((r) => !r.hit);

  return (
    <>
      <div className="result-stat-row">
        Hit Rate: <b>{hitRate}%</b> ({hits.length}/{total})
      </div>
      <div className="result-stat-row">
        Ø Darts per hit target: <b>{dartsPerHit}</b>
      </div>
      {groups.map((group) => {
        const inGroup = results.filter((r) => r.group === group);
        const groupHits = inGroup.filter((r) => r.hit).length;
        return (
          <div key={group} className="result-stat-row">
            {SEGMENT_GROUP_LABELS[group] ?? group}:{" "}
            <b>
              {Math.round((groupHits / inGroup.length) * 100)}%
            </b>{" "}
            ({groupHits}/{inGroup.length})
          </div>
        );
      })}
      {missed.length > 0 && (
        <div className="result-stat-row result-missed-targets">
          Missed: <b>{missed.map((r) => r.label).join(", ")}</b>
        </div>
      )}
    </>
  );
}

// Endauswertung Pressure 501 - alle Werte kommen aus dem Replay
// (siehe engine/families/x01.ts pressureSummary).
function PressureSummary({
  summary,
  gameMode,
}: {
  summary: NonNullable<MatchPlayer["pressureSummary"]>;
  gameMode: "training" | "strict";
}) {
  const fmt = (value: number | null, suffix = "") => (value === null ? "—" : `${value}${suffix}`);
  return (
    <>
      <div className="result-stat-row">
        Points: <b>{summary.points}</b> / {summary.maxPoints}
      </div>
      <div className="result-stat-row">
        3-dart average: <b>{fmt(summary.average)}</b>
      </div>
      <div className="result-stat-row">
        Targets reached: <b>{summary.targetsReached}</b> / {summary.legsPlayed} ({fmt(summary.legsWonVsGhostPercent, "%")})
      </div>
      {/* Im Strict Mode endet das Leg am Limit - Overtime kann es dort
          gar nicht geben, deshalb entfaellt die Zeile. */}
      {gameMode === "training" && (
        <div className="result-stat-row">
          Ø overtime on missed legs: <b>{summary.avgOvertime === null ? "—" : `+${summary.avgOvertime}`}</b>
        </div>
      )}
      <div className="result-stat-row">
        Ø darts per leg: <b>{fmt(summary.avgDartsPerLeg)}</b>
      </div>
      <div className="result-stat-row">
        Checkout rate: <b>{fmt(summary.checkoutPercent, "%")}</b>
      </div>
      <div className="result-stat-row">
        Ø remaining on unfinished legs: <b>{fmt(summary.avgRemainingOnAbort)}</b>
      </div>
      <div className="result-stat-row">
        Under pressure — ahead <b>{fmt(summary.averageAhead)}</b> vs. behind <b>{fmt(summary.averageBehind)}</b>
      </div>
    </>
  );
}
