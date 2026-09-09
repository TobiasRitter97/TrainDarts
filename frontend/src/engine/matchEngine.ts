// Port von backend/engine/engine.py (Phase C des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). Echtes Event-Sourcing:
// der Spielzustand ist IMMER ein Replay des Event-Logs - Korrektur und
// Undo aendern nur das Log, nie den State direkt.
//
// WICHTIG: Phase C portiert bewusst nur die x01-Familie ("170") end-
// zu-Ende, um den Engine-Kern gegen ein echtes Spiel zu verifizieren.
// Die anderen 9 Spiele (TASK_BASED_FAMILIES, target_progression,
// accuracy_progression, jdc) folgen in Phase D nach demselben Muster -
// ihre Zweige sind hier absichtlich noch nicht implementiert (siehe
// TODOs) und werfen einen Fehler, falls sie versehentlich erreicht
// werden. Bis Phase D fertig ist, laufen die anderen 9 Spiele
// unveraendert ueber den alten Python-Backend-Pfad weiter.
//
// Event-Typen (identisch zum Python-Original):
//   MATCH_STARTED           - einmalig
//   THROW                    - {throwSeq, segment, source}
//   VISIT_CONFIRMED          - Takeout-Bestaetigung
//   CORRECT_THROW             - {targetThrowSeq, segment}
//   ROUND_RANDOM_GENERATED   - (Phase D, random_checkout)
import { throwLabel } from "../board/autodartsAdapter";
import { GameDefinition, MatchPlayer, MatchState, MatchThrow } from "../api";
import { suggestRoute } from "./checkout";
import * as x01Family from "./families/x01";
import { CheckoutMode, Segment, segmentValue } from "./scoring";

export type MatchPlayerRef = { id: string; name: string; color?: string | null; initials?: string | null };

type ThrowEvent = { type: "THROW"; payload: { throwSeq: number; segment: Segment; source: string } };
type VisitConfirmedEvent = { type: "VISIT_CONFIRMED"; payload: Record<string, never> };
type CorrectThrowEvent = { type: "CORRECT_THROW"; payload: { targetThrowSeq: number; segment: Segment } };
type MatchStartedEvent = { type: "MATCH_STARTED"; payload: Record<string, unknown> };
export type MatchEvent = ThrowEvent | VisitConfirmedEvent | CorrectThrowEvent | MatchStartedEvent;

const VISIT_DART_CAP = 3;
const HISTORY_LIMIT = 3;

const FORCES_VISIT_END: Record<string, Set<string>> = {
  x01: new Set(["bust", "checkout"]),
};

const COUNTDOWN_FIELD: Record<string, string> = {
  x01: "score",
};

const X01_MATCH_MODE_LEGS: Record<string, number> = { "1_leg": 1, bo3: 2, bo5: 3, bo7: 4 };

// player_state ist je Familie unterschiedlich geformt - hier bewusst
// als "irgendein Objekt" typisiert (wie im Python-Original ein plain
// dict), damit spaetere Familien (Phase D) sich problemlos einreihen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlayerState = Record<string, any>;

export class MatchEngine {
  matchId: string;
  game: GameDefinition;
  players: MatchPlayerRef[];
  settings: Record<string, unknown>;
  familyName: string;

  events: MatchEvent[] = [];

  activeIndex = 0;
  currentVisitThrows: Segment[] = [];
  currentVisitSeqs: number[] = [];
  roundNumber = 1;
  legNumber = 1;
  setNumber = 1;
  startingPlayerIndex = 0;
  finished = false;
  winnerId: string | null = null;
  pendingConfirmation = false;
  pendingOutcome: string | null = null;
  visitHistory: { playerId: string; throws: MatchThrow[] }[] = [];

  // Vollstaendige Protokolle fuer Profil-Statistiken (Phase E) - jeder
  // tatsaechlich gezaehlte Wurf bzw. jede bestaetigte Aufnahme des
  // GANZEN Matches, unabhaengig von der Spielfamilie.
  throwLog: { playerId: string; segment: Segment }[] = [];
  visitLog: { playerId: string; throws: Segment[]; outcome: string | null; value: number }[] = [];

  playerStates: Record<string, PlayerState> = {};

  constructor(
    matchId: string,
    game: GameDefinition,
    players: MatchPlayerRef[],
    settings: Record<string, unknown>,
    events?: MatchEvent[]
  ) {
    this.matchId = matchId;
    this.game = game;
    this.players = players;
    this.settings = settings;
    this.familyName = game.engineFamily;

    if (events) {
      this.events = [...events];
    } else {
      this.append("MATCH_STARTED", {});
    }
    this.replay();
  }

  // ------------------------------------------------------------ Event-Log
  private append(type: MatchEvent["type"], payload: Record<string, unknown>): void {
    this.events.push({ type, payload } as MatchEvent);
  }

  private nextThrowSeq(): number {
    const seqs = this.events
      .filter((e): e is ThrowEvent => e.type === "THROW")
      .map((e) => e.payload.throwSeq);
    return seqs.length > 0 ? Math.max(...seqs) + 1 : 0;
  }

  // Neuer Wurf vom Board (oder manuell via + DART). Waehrend eine
  // Aufnahme auf Bestaetigung wartet, werden keine weiteren Darts
  // gezaehlt - erst confirmVisit() oder correctThrow() aendern wieder
  // etwas.
  handleThrow(_label: string, raw: { segment?: Segment }, source: "auto" | "manual" = "auto"): boolean {
    if (this.finished || this.pendingConfirmation) return false;
    const segment = raw.segment ?? { number: 0, multiplier: 0 };
    this.append("THROW", { throwSeq: this.nextThrowSeq(), segment, source });
    this.replay();
    return true;
  }

  // + DART: manuell erfasster Dart, technisch identisch zu einem
  // automatisch erkannten Wurf.
  addManualThrow(segment: Segment): boolean {
    return this.handleThrow(throwLabel(segment), { segment }, "manual");
  }

  // Takeout-Bestaetigung oder manueller "Aufnahme bestaetigen"-
  // Fallback. Erst danach greifen Spielerwechsel, Leg-/Run-Wechsel.
  confirmVisit(): boolean {
    if (this.currentVisitThrows.length === 0) return false;
    this.append("VISIT_CONFIRMED", {});
    this.replay();
    return true;
  }

  // Korrigiert einen beliebigen Wurf (aktuelle ODER vergangene
  // Aufnahme) - der urspruengliche Wurf bleibt im Log stehen, gilt beim
  // Replay aber als ersetzt.
  correctThrow(targetThrowSeq: number, segment: Segment): boolean {
    const exists = this.events.some((e) => e.type === "THROW" && e.payload.throwSeq === targetThrowSeq);
    if (!exists) return false;
    this.append("CORRECT_THROW", { targetThrowSeq, segment });
    this.replay();
    return true;
  }

  // Entfernt das letzte Event (Wurf, Bestaetigung oder Korrektur) und
  // spielt neu ab - macht dadurch automatisch auch bereits vollzogene
  // Spieler-/Leg-Wechsel rueckgaengig.
  undo(): boolean {
    if (this.events.length <= 1) return false; // nur MATCH_STARTED uebrig
    this.events.pop();
    this.replay();
    return true;
  }

  // ------------------------------------------------------------ Replay
  private replay(): void {
    this.activeIndex = 0;
    this.currentVisitThrows = [];
    this.currentVisitSeqs = [];
    this.roundNumber = 1;
    this.legNumber = 1;
    this.setNumber = 1;
    this.startingPlayerIndex = 0;
    this.finished = false;
    this.winnerId = null;
    this.pendingConfirmation = false;
    this.pendingOutcome = null;
    this.visitHistory = [];
    this.throwLog = [];
    this.visitLog = [];

    this.playerStates = {};
    for (const p of this.players) {
      this.playerStates[p.id] = this.createPlayerState();
    }

    const corrections = new Map<number, Segment>();
    for (const e of this.events) {
      if (e.type === "CORRECT_THROW") corrections.set(e.payload.targetThrowSeq, e.payload.segment);
    }

    for (const e of this.events) {
      if (e.type === "THROW") {
        const segment = corrections.get(e.payload.throwSeq) ?? e.payload.segment;
        this.replayThrow(segment, e.payload.throwSeq);
      } else if (e.type === "VISIT_CONFIRMED") {
        this.replayConfirm();
      }
      // ROUND_RANDOM_GENERATED folgt in Phase D (random_checkout).
    }
  }

  private createPlayerState(): PlayerState {
    if (this.familyName === "x01") return x01Family.createPlayerState();
    throw new Error(`Engine-Familie "${this.familyName}" ist im Client-Rewrite noch nicht portiert (Phase D)`);
  }

  private replayThrow(segment: Segment, throwSeq: number): void {
    if (this.finished || this.pendingConfirmation) {
      // Kann bei einer Korrektur passieren, die eine fruehere Aufnahme
      // rueckwirkend zum Bust/Checkout macht - danach geworfene Darts
      // derselben (jetzt schon abgeschlossenen) Aufnahme werden beim
      // Replay bewusst ignoriert.
      return;
    }
    this.currentVisitThrows.push(segment);
    this.currentVisitSeqs.push(throwSeq);

    const activeId = this.players[this.activeIndex].id;
    this.throwLog.push({ playerId: activeId, segment });
    const state = this.playerStates[activeId];
    const result = this.applyThrow(state, this.currentVisitThrows);

    const forcesEnd = FORCES_VISIT_END[this.familyName]?.has(result.outcome as string) ?? false;
    if (forcesEnd || this.currentVisitThrows.length >= VISIT_DART_CAP) {
      this.pendingConfirmation = true;
      this.pendingOutcome = (result.outcome as string) ?? null;
    }
  }

  private replayConfirm(): void {
    if (this.currentVisitThrows.length === 0) return; // nichts zu bestaetigen
    const activeId = this.players[this.activeIndex].id;
    const state = this.playerStates[activeId];
    const result = this.applyThrow(state, this.currentVisitThrows);
    this.commitVisit(activeId, result);
    this.pendingConfirmation = false;
    this.pendingOutcome = null;
  }

  private applyThrow(state: PlayerState, visitThrows: Segment[]): { outcome?: string; score?: number } {
    if (this.familyName === "x01") return x01Family.applyThrow(state as x01Family.X01PlayerState, visitThrows, this.settings);
    throw new Error(`Engine-Familie "${this.familyName}" ist im Client-Rewrite noch nicht portiert (Phase D)`);
  }

  // ------------------------------------------------------------ commit (nach Bestaetigung)
  private commitVisit(playerId: string, result: { outcome?: string; score?: number }): void {
    const state = this.playerStates[playerId];
    const outcome = result.outcome ?? null;
    const checkoutValue = this.currentVisitThrows.reduce((sum, t) => sum + segmentValue(t), 0);

    this.visitLog.push({ playerId, throws: [...this.currentVisitThrows], outcome, value: checkoutValue });

    this.visitHistory.push({
      playerId,
      throws: this.currentVisitSeqs.map((seq, i) => ({ throwSeq: seq, label: throwLabel(this.currentVisitThrows[i]) })),
    });
    this.visitHistory = this.visitHistory.slice(-HISTORY_LIMIT);

    if (this.familyName === "x01") {
      state.score = result.score;
      if (outcome === "checkout") {
        state.legsWon += 1;
        if (checkoutValue > state.highestCheckout) state.highestCheckout = checkoutValue;
        this.maybeFinishMatchX01(playerId);
        if (!this.finished) {
          this.startNewLeg();
          this.clearVisit();
          return; // startNewLeg hat den naechsten Spieler schon gesetzt
        }
      }
      this.clearVisit();
      if (!this.finished) this.advancePlayer();
      return;
    }

    throw new Error(`Engine-Familie "${this.familyName}" ist im Client-Rewrite noch nicht portiert (Phase D)`);
  }

  private clearVisit(): void {
    this.currentVisitThrows = [];
    this.currentVisitSeqs = [];
  }

  private advancePlayer(): void {
    // Rundengrenze relativ zum Startspieler dieses Legs, nicht zu
    // Index 0 - bei 170 rotiert der Startspieler pro Leg.
    const lastOfRoundIndex = (this.startingPlayerIndex - 1 + this.players.length) % this.players.length;
    const wasLast = this.activeIndex === lastOfRoundIndex;
    this.activeIndex = (this.activeIndex + 1) % this.players.length;
    if (wasLast) this.roundNumber += 1;
  }

  // ------------------------------------------------------------ x01 legs
  private setsEnabled(): boolean {
    return Boolean(this.settings.setsEnabled);
  }

  private matchModeTarget(): number | null {
    const mode = (this.settings.matchMode as string) ?? "bo3";
    if (mode in X01_MATCH_MODE_LEGS) return X01_MATCH_MODE_LEGS[mode];
    if (mode === "custom") return Number(this.settings.customLegsToWin ?? 3);
    return null; // endless
  }

  private maybeFinishMatchX01(winnerId: string): void {
    if (this.setsEnabled()) {
      this.maybeFinishSetX01(winnerId);
      return;
    }
    const target = this.matchModeTarget();
    if (target !== null && this.playerStates[winnerId].legsWon >= target) {
      this.finished = true;
      this.winnerId = winnerId;
    }
  }

  private maybeFinishSetX01(winnerId: string): void {
    const legsPerSet = Number(this.settings.legsPerSet ?? 3);
    const setsToWin = Number(this.settings.setsToWin ?? 2);
    const state = this.playerStates[winnerId];
    if (state.legsWon < legsPerSet) return; // Satz noch nicht entschieden
    state.setsWon += 1;
    for (const p of this.players) this.playerStates[p.id].legsWon = 0;
    this.setNumber += 1;
    this.legNumber = 0; // startNewLeg() zaehlt gleich wieder auf 1 hoch
    if (state.setsWon >= setsToWin) {
      this.finished = true;
      this.winnerId = winnerId;
    }
  }

  private startNewLeg(): void {
    this.legNumber += 1;
    this.startingPlayerIndex = (this.startingPlayerIndex + 1) % this.players.length;
    this.activeIndex = this.startingPlayerIndex;
    this.roundNumber = 1;
    for (const p of this.players) this.playerStates[p.id].score = x01Family.STARTING_SCORE;
  }

  // ------------------------------------------------------------ display
  private liveScore(playerId: string): number | null {
    const field = COUNTDOWN_FIELD[this.familyName];
    if (!field) return null;
    const state = this.playerStates[playerId];
    const committed = state[field] as number;
    const isActive = playerId === this.players[this.activeIndex].id;
    if (!isActive || this.currentVisitThrows.length === 0) return committed;
    const result = this.applyThrow(state, this.currentVisitThrows);
    return result.score ?? committed;
  }

  private targetDisplay(): string | null {
    // x01 hat kein separates "Ziel" (nur den Score) - andere Familien
    // folgen in Phase D.
    return null;
  }

  private checkoutSuggestion(): string[] | null {
    if (this.pendingConfirmation || this.familyName !== "x01") return null;
    const activeId = this.players[this.activeIndex].id;
    const remaining = this.liveScore(activeId);
    if (remaining === null) return null;
    const dartsLeft = VISIT_DART_CAP - this.currentVisitThrows.length;
    const checkoutMode = (this.settings.checkoutMode as CheckoutMode) ?? "double_out";
    return suggestRoute(remaining, dartsLeft, checkoutMode);
  }

  toDict(): MatchState {
    const activePlayer = this.players[this.activeIndex];
    return {
      matchId: this.matchId,
      gameId: this.game.id,
      gameName: this.game.name,
      engineFamily: this.familyName,
      settings: this.settings,
      players: this.players.map((p) => this.playerDisplay(p)),
      activePlayerId: activePlayer.id,
      currentVisitThrows: this.currentVisitSeqs.map((seq, i) => ({
        throwSeq: seq,
        label: throwLabel(this.currentVisitThrows[i]),
      })),
      target: this.targetDisplay(),
      phase: null,
      checkoutSuggestion: this.checkoutSuggestion(),
      round: this.roundNumber,
      legNumber: this.familyName === "x01" ? this.legNumber : null,
      setNumber: this.familyName === "x01" && this.setsEnabled() ? this.setNumber : null,
      pendingConfirmation: this.pendingConfirmation,
      pendingOutcome: this.pendingOutcome as MatchState["pendingOutcome"],
      history: this.visitHistory.map((v) => ({ playerId: v.playerId, throws: v.throws })),
      canUndo: this.events.length > 1,
      finished: this.finished,
      winnerId: this.winnerId,
      winnerName: this.players.find((p) => p.id === this.winnerId)?.name ?? null,
    };
  }

  private playerDisplay(player: MatchPlayerRef): MatchPlayer {
    const state = this.playerStates[player.id];
    return {
      id: player.id,
      name: player.name,
      score: this.liveScore(player.id),
      legsWon: state.legsWon ?? null,
      setsWon: state.setsWon ?? null,
      highestCheckout: state.highestCheckout ?? null,
      highestLevel: state.highestLevel ?? null,
      runsCompleted: state.runsCompleted ?? null,
      totalScore: state.totalScore ?? null,
      bestRun: state.bestRun ?? null,
      successfulCheckouts: state.successfulCheckouts ?? null,
      attempts: state.attempts ?? null,
      successfulTargets: state.successfulTargets ?? null,
      totalHits: state.totalHits ?? null,
      totalDarts: state.totalDarts ?? null,
      singles: state.singles ?? null,
      doubles: state.doubles ?? null,
      triples: state.triples ?? null,
      perfectTargets: state.perfectTargets ?? null,
      openNumbers: state.openNumbers ?? null,
      shanghaiCount: state.shanghaiCount ?? null,
      phaseScores: state.phaseScores ?? null,
    };
  }
}
