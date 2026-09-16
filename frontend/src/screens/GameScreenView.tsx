import { useState } from "react";
import { ArrowLeft, Crosshair, ListChecks, Percent, Target, Trophy } from "lucide-react";
import { GameDefinition, MatchState, Segment } from "../api";
import { BoardStatus } from "../board/autodartsAdapter";
import { PlayerScoreboard } from "../components/PlayerScoreboard";
import { CheckoutRouteDisplay } from "../components/CheckoutRouteDisplay";
import { GameProgress } from "../components/GameProgress";
import { GameActions } from "../components/GameActions";
import { DartCorrectionModal } from "../components/DartCorrectionModal";
import { GroupingTrendChart } from "../components/GroupingTrendChart";
import { PlayerBadge } from "../components/PlayerBadge";
import { ScoreDisplay } from "../components/ScoreDisplay";
import { ThrowSequenceBar } from "../components/ThrowSequenceBar";
import { VisitLogList } from "../components/VisitLogList";
import { StatCard } from "../components/StatCard";
import { BoardPanel } from "../components/BoardPanel";
import { ResultScreen } from "./ResultScreen";
import "./GameScreen.css";

type CorrectionTarget = { mode: "add" } | { mode: "correct"; throwSeq: number };
type Tab = "visit-log" | "game-stats";

export type GameSessionActions = {
  onUndo: () => void;
  onAddThrow: (segment: Segment) => void;
  onCorrectThrow: (throwSeq: number, segment: Segment) => void;
  onConfirm: () => void;
  onRematch: () => void;
};

type Props = {
  match: MatchState;
  game: GameDefinition;
  actions: GameSessionActions;
  boardStatus: BoardStatus;
  onOpenSettings: () => void;
  // Ob der Fortschritt bei "Spiel verlassen" erhalten bleibt (Remote-
  // Spiele: ja, per Backend/SQLite. Lokale Spiele vor Phase E: nein -
  // andere Bestaetigungsmeldung noetig, siehe handleExit).
  persistsProgress: boolean;
  // Ob DIESES Geraet gerade Aenderungen vornehmen darf - bei lokalen
  // Partien immer true (ein Geraet, ein Board), bei Online-Partien nur
  // fuer den Teilnehmer, dessen Spieler gerade am Zug ist (Tobias-
  // Feedback 09.09.2026: der jeweils andere Mitspieler soll fremde
  // Aufnahmen nicht korrigieren koennen).
  canAct?: boolean;
  onExit: () => void;
};

function pendingLabel(outcome: string | null): string {
  if (outcome === "bust") return "BUST — CONFIRM";
  if (outcome === "checkout") return "CHECKOUT! — CONFIRM";
  if (outcome === "round_done") return "ROUND DONE — CONFIRM";
  return "VISIT DONE — CONFIRM";
}

// Redesign 16.09.2026 (Tobias' Referenzbild 2): Spielbildschirm mit
// prominenter Wurfsequenz-Leiste oben, links ein Info-/Statistik-Panel,
// rechts ein visueller Board-Bereich. Bestehende Spiellogik/Datenfluss
// (match-Prop, actions-Prop) unveraendert - reines UI-/Struktur-
// Redesign, unabhaengig davon, ob der State vom alten Backend (siehe
// GameScreen.tsx) oder von der neuen lokalen Client-Engine (siehe
// LocalGameScreen.tsx) kommt. Nach Erreichen des Dart-Caps (oder Bust/
// Checkout) friert die Anzeige ein, bis Takeout oder der manuelle
// "Confirm Visit"-Button den State committet. Jeder Dart der aktuellen
// und der letzten Aufnahmen ist antippbar und korrigierbar.
export function GameScreenView({ match, game, actions, boardStatus, onOpenSettings, persistsProgress, canAct = true, onExit }: Props) {
  const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
  const [tab, setTab] = useState<Tab>("visit-log");

  if (match.finished) {
    return <ResultScreen match={match} onRematch={actions.onRematch} onExit={onExit} />;
  }

  function handleExit() {
    const message = persistsProgress
      ? "Leave the game? Progress is saved and can be resumed later."
      : "Leave the game? Progress will be lost.";
    if (confirm(message)) onExit();
  }

  function handleCorrectionSelect(segment: Segment) {
    if (!correction || !canAct) return;
    if (correction.mode === "add") {
      actions.onAddThrow(segment);
    } else {
      actions.onCorrectThrow(correction.throwSeq, segment);
    }
    setCorrection(null);
  }

  const darts = [match.currentVisitThrows[0] ?? null, match.currentVisitThrows[1] ?? null, match.currentVisitThrows[2] ?? null];
  const activePlayer = match.players.find((p) => p.id === match.activePlayerId);

  return (
    <div className="game-screen">
      <div className="game-screen-topbar">
        <button type="button" className="back-to-hub-link" onClick={handleExit}>
          <ArrowLeft size={18} strokeWidth={2} />
          Back to Game Hub
        </button>
        <div className="game-screen-title">{game.name}</div>
      </div>

      <PlayerScoreboard
        players={match.players}
        activePlayerId={match.activePlayerId}
        pendingConfirmation={match.pendingConfirmation}
        pendingOutcome={match.pendingOutcome}
      />

      <ThrowSequenceBar
        darts={darts}
        pendingConfirmation={match.pendingConfirmation}
        canAct={canAct}
        onSlotClick={(_i, dart) => {
          if (!canAct) return;
          if (dart) setCorrection({ mode: "correct", throwSeq: dart.throwSeq });
          else setCorrection({ mode: "add" });
        }}
      />

      <div className="game-screen-body">
        <div className="game-screen-left">
          <div className="panel game-info-panel">
            <div className={`active-player-status ${match.pendingConfirmation ? "pending" : ""}`}>
              {match.pendingConfirmation ? pendingLabel(match.pendingOutcome) : "CURRENT PLAYER"}
            </div>
            {!canAct && <div className="waiting-for-turn-label">Not your turn — spectating only</div>}
            {match.phase && <div className="jdc-phase-label">{match.phase}</div>}

            {activePlayer && (
              <div className="game-info-player-row">
                <PlayerBadge player={activePlayer} />
                <span className="game-info-darts-count">
                  {match.currentVisitThrows.length}/3 darts this visit
                </span>
              </div>
            )}

            {match.attemptInfo && (
              <div className="attempt-info-label">
                {match.attemptInfo.label} {match.attemptInfo.current}
                {match.attemptInfo.total !== null ? ` OF ${match.attemptInfo.total}` : ""}
              </div>
            )}

            {match.target && <ScoreDisplay label="Target" value={match.target} />}

            {match.engineFamily === "random_checkout" && activePlayer?.score !== null && activePlayer?.score !== undefined && (
              <ScoreDisplay label="Your Remaining" value={activePlayer.score} size="md" />
            )}

            <CheckoutRouteDisplay route={match.checkoutSuggestion} />

            {activePlayer?.groupingRounds && activePlayer.groupingRounds.length > 0 && (
              <div className="grouping-info">
                <div className="target-label">
                  LAST ROUND
                  {activePlayer.groupingRounds[activePlayer.groupingRounds.length - 1].mm !== null
                    ? ` — ${activePlayer.groupingRounds[activePlayer.groupingRounds.length - 1].mm!.toFixed(1)} mm`
                    : " — no valid coordinates"}
                </div>
                <GroupingTrendChart rounds={activePlayer.groupingRounds} bestIndex={activePlayer.bestGroupingRoundIndex} />
              </div>
            )}

            {activePlayer?.openNumbers && (
              <div className="open-numbers">
                <div className="target-label">OPEN NUMBERS</div>
                <div className="open-numbers-list">
                  {activePlayer.openNumbers.map((n) => (
                    <span key={n} className={`open-number-chip ${String(n) === match.target ? "active" : ""}`}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <GameProgress round={match.round} legNumber={match.legNumber} setNumber={match.setNumber} />
          </div>

          <div className="panel game-tabs-panel">
            <div className="game-tabs-row" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "visit-log"}
                className={`game-tab ${tab === "visit-log" ? "active" : ""}`}
                onClick={() => setTab("visit-log")}
              >
                <ListChecks size={16} strokeWidth={2} />
                Visit Log
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "game-stats"}
                className={`game-tab ${tab === "game-stats" ? "active" : ""}`}
                onClick={() => setTab("game-stats")}
              >
                <Percent size={16} strokeWidth={2} />
                Game Stats
              </button>
            </div>

            {tab === "visit-log" ? (
              <VisitLogList
                history={match.history}
                players={match.players}
                canAct={canAct}
                onSelectThrow={(throwSeq) => setCorrection({ mode: "correct", throwSeq })}
              />
            ) : (
              <GameStatsGrid player={activePlayer} />
            )}
          </div>
        </div>

        <div className="game-screen-right">
          <BoardPanel
            boardStatus={boardStatus}
            canUndo={match.canUndo}
            canAct={canAct}
            onUndo={actions.onUndo}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>

      <GameActions
        canUndo={match.canUndo}
        canAddDart={!match.pendingConfirmation && match.currentVisitThrows.length < 3}
        canConfirm={match.currentVisitThrows.length > 0}
        visitComplete={match.pendingConfirmation}
        canAct={canAct}
        onUndo={actions.onUndo}
        onAddDart={() => canAct && setCorrection({ mode: "add" })}
        onConfirm={actions.onConfirm}
        onExit={handleExit}
      />

      {correction && (
        <DartCorrectionModal
          title={correction.mode === "add" ? "Add dart" : "Correct dart"}
          onSelect={handleCorrectionSelect}
          onClose={() => setCorrection(null)}
        />
      )}
    </div>
  );
}

// "Game Stats"-Tab: zeigt die vorhandenen Kennzahlen des aktiven
// Spielers (je nach Spielfamilie unterschiedlich befuellt, siehe
// engine/matchEngine.ts playerDisplay()) - gleiches Auswahlprinzip wie
// ResultScreen.tsx, nur live waehrend des laufenden Matches statt am
// Ende.
function GameStatsGrid({ player }: { player: MatchState["players"][number] | undefined }) {
  if (!player) return null;
  const cards: { icon: typeof Target; label: string; value: string | number }[] = [];

  // x01 (170) hat keine "attempts"/"totalDarts" - dort sind Legs/Sets
  // die aussagekraeftigen Live-Kennzahlen.
  if (player.legsWon !== null) cards.push({ icon: Trophy, label: "Legs Won", value: player.legsWon });
  if (player.setsWon !== null) cards.push({ icon: Trophy, label: "Sets Won", value: player.setsWon });

  if (player.attempts !== null) cards.push({ icon: Target, label: "Attempts", value: player.attempts });
  if (player.totalDarts) {
    cards.push({ icon: Percent, label: "Hit Rate", value: `${Math.round(((player.totalHits ?? 0) / player.totalDarts) * 100)}%` });
  } else if (player.successfulCheckouts !== null && player.attempts) {
    cards.push({ icon: Percent, label: "Checkout %", value: `${Math.round((player.successfulCheckouts / player.attempts) * 100)}%` });
  }
  if (player.bestRun !== null && player.bestRun !== undefined) cards.push({ icon: Trophy, label: "Best Run", value: player.bestRun });
  if (player.highestCheckout) cards.push({ icon: Trophy, label: "Highest Checkout", value: player.highestCheckout });
  if (player.highestLevel !== null) cards.push({ icon: Trophy, label: "Highest Level", value: player.highestLevel });
  if (player.successfulTargets !== null) cards.push({ icon: Crosshair, label: "Successful Targets", value: player.successfulTargets });
  if (player.totalScore !== null) cards.push({ icon: Trophy, label: "Total Score", value: player.totalScore });

  if (cards.length === 0) return <p className="visit-log-empty">No stats yet.</p>;

  return (
    <div className="game-stats-grid">
      {cards.map((c) => (
        <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} />
      ))}
    </div>
  );
}
