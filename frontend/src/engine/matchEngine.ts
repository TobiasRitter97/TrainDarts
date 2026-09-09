// Port von backend/engine/engine.py (Phase C/D des Client-Rewrites,
// siehe ~/.claude/plans/agile-brewing-wadler.md). Echtes Event-Sourcing:
// der Spielzustand ist IMMER ein Replay des Event-Logs - Korrektur und
// Undo aendern nur das Log, nie den State direkt.
//
// Phase D ergaenzt die letzten 6 Engine-Familien (9 Spiele) neben dem
// in Phase C portierten x01 ("170") - damit sind jetzt alle 10 Spiele
// auf die Client-Engine portiert.
//
// Event-Typen (identisch zum Python-Original):
//   MATCH_STARTED           - einmalig, traegt bei random_checkout/
//                             catch die vorab erzeugte Zufallssequenz
//   THROW                    - {throwSeq, segment, source}
//   VISIT_CONFIRMED          - Takeout-Bestaetigung
//   CORRECT_THROW             - {targetThrowSeq, segment}
//   ROUND_RANDOM_GENERATED   - neues Zufallsziel fuer Endless-Runden
import { throwLabel } from "../board/autodartsAdapter";
import { GameDefinition, MatchPlayer, MatchState, MatchThrow } from "../api";
import { suggestRoute } from "./checkout";
import * as accuracyProgressionFamily from "./families/accuracyProgression";
import * as catchFamily from "./families/catch";
import * as checkoutRangeFamily from "./families/checkoutRange";
import * as jdcFamily from "./families/jdc";
import * as randomCheckoutFamily from "./families/randomCheckout";
import * as targetProgressionFamily from "./families/targetProgression";
import * as x01Family from "./families/x01";
import { CheckoutMode, Segment, segmentValue } from "./scoring";

export type MatchPlayerRef = { id: string; name: string; color?: string | null; initials?: string | null };

type ThrowEvent = { type: "THROW"; payload: { throwSeq: number; segment: Segment; source: string } };
type VisitConfirmedEvent = { type: "VISIT_CONFIRMED"; payload: Record<string, never> };
type CorrectThrowEvent = { type: "CORRECT_THROW"; payload: { targetThrowSeq: number; segment: Segment } };
type MatchStartedEvent = {
  type: "MATCH_STARTED";
  payload: { randomTargets?: number[]; catchTargets?: number[] };
};
type RoundRandomGeneratedEvent = { type: "ROUND_RANDOM_GENERATED"; payload: { value: number } };
export type MatchEvent = ThrowEvent | VisitConfirmedEvent | CorrectThrowEvent | MatchStartedEvent | RoundRandomGeneratedEvent;

const VISIT_DART_CAP = 3;
const HISTORY_LIMIT = 3;

const FORCES_VISIT_END: Record<string, Set<string>> = {
  x01: new Set(["bust", "checkout"]),
  random_checkout: new Set(["bust", "checkout"]),
  checkout_range: new Set(["bust", "checkout"]),
  catch: new Set(["bust", "checkout"]),
  target_progression: new Set(["target_done"]),
  accuracy_progression: new Set(["target_done"]),
  jdc: new Set(["target_done"]),
};

const COUNTDOWN_FIELD: Record<string, string> = {
  x01: "score",
  target_progression: "score",
  random_checkout: "attemptRemaining",
  checkout_range: "attemptRemaining",
  catch: "attemptRemaining",
  jdc: "runScore",
};

const X01_MATCH_MODE_LEGS: Record<string, number> = { "1_leg": 1, bo3: 2, bo5: 3, bo7: 4 };
const BOBS27_MODE_RUNS: Record<string, number> = { single: 1, bo3: 3, bo5: 5 };

// Spielerwechsel und Versuchs-Fortschritt sind ZWEI GETRENNTE Dinge.
// Nach JEDER Aufnahme (Takeout) wechselt immer der Spieler (siehe
// advanceToNextEligiblePlayer). Die Einstellung "Darts per Checkout"
// bestimmt unabhaengig davon, wie viele eigene Aufnahmen ein Spieler
// insgesamt fuer EINEN Checkout-Versuch bekommt (abwechselnd mit den
// anderen Spielern, nicht am Stueck) - siehe commitTaskVisit/
// maybeAdvanceTaskRound. catch nutzt dieselbe Maschinerie, aber mit
// fest 6 Darts (nicht einstellbar) und OHNE "stay on fail".
const TASK_BASED_FAMILIES = new Set(["checkout_range", "random_checkout", "catch"]);
const DEFAULT_DARTS_PER_CHECKOUT: Record<string, number> = { checkout_range: 9, random_checkout: 6, catch: 6 };
const TASK_NOMINAL_FIELD: Record<string, string> = { checkout_range: "level", catch: "level", random_checkout: "remaining" };

// player_state ist je Familie unterschiedlich geformt - hier bewusst
// als "irgendein Objekt" typisiert (wie im Python-Original ein plain
// dict).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlayerState = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThrowResult = Record<string, any>;

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

  randomTargetIndex = 0;
  randomTargets: number[] = [];
  catchTargets: number[] = [];

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
      const payload: MatchStartedEvent["payload"] = {};
      if (this.familyName === "random_checkout") payload.randomTargets = this.generateRandomTargets();
      if (this.familyName === "catch") payload.catchTargets = this.generateCatchTargets();
      this.append("MATCH_STARTED", payload);
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
    this.ensureEndlessTarget();
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
    this.ensureEndlessTarget();
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

  // Erzeugt bei Bedarf das naechste Zufallsziel fuer Endless Random
  // Checkout - als eigenes Event, damit Replay deterministisch bleibt
  // (kein Math.random() waehrend replay()).
  private ensureEndlessTarget(): void {
    if (this.familyName !== "random_checkout" || this.finished) return;
    if (!Boolean(this.settings.endless)) return;
    if (this.randomTargetIndex < this.randomTargets.length) return;
    const lo = Number(this.settings.minCheckout ?? 40);
    const hi = Number(this.settings.maxCheckout ?? 120);
    this.append("ROUND_RANDOM_GENERATED", { value: randomInt(lo, hi) });
    this.replay();
  }

  private generateRandomTargets(): number[] {
    const lo = Number(this.settings.minCheckout ?? 40);
    const hi = Number(this.settings.maxCheckout ?? 120);
    const endless = Boolean(this.settings.endless);
    const count = endless ? 1 : Number(this.settings.numberOfCheckouts ?? 20);
    return Array.from({ length: Math.max(count, 1) }, () => randomInt(lo, hi));
  }

  // Einmal pro Match erzeugte Zahlenfolge (Fairness: alle Spieler
  // durchlaufen dieselbe Folge) - bei Shuffle gemischt, sonst
  // aufsteigend. Wird im MATCH_STARTED-Event festgehalten, damit
  // Replay deterministisch bleibt.
  private generateCatchTargets(): number[] {
    const [lo, hi] = this.game.catchRange ?? [41, 81];
    const values = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    if (Boolean(this.settings.shuffle)) shuffleInPlace(values);
    return values;
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

    this.randomTargetIndex = 0;
    const startPayload = this.events[0]?.payload as MatchStartedEvent["payload"];
    this.randomTargets = [...(startPayload?.randomTargets ?? [])];
    this.catchTargets = [...(startPayload?.catchTargets ?? [])];

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
      } else if (e.type === "ROUND_RANDOM_GENERATED") {
        this.randomTargets.push(e.payload.value);
      }
    }
  }

  private createPlayerState(): PlayerState {
    switch (this.familyName) {
      case "x01":
        return x01Family.createPlayerState();
      case "random_checkout":
        return randomCheckoutFamily.createPlayerState(this.randomTargets[0] ?? 0);
      case "target_progression":
        return targetProgressionFamily.createPlayerState(this.game.targets ?? targetProgressionFamily.BOBS27_TARGETS);
      case "checkout_range":
        return checkoutRangeFamily.createPlayerState(this.settings);
      case "catch":
        return catchFamily.createPlayerState(this.catchTargets);
      case "accuracy_progression":
        return accuracyProgressionFamily.createPlayerState(accuracyProgressionFamily.buildOpenNumbers(this.settings));
      case "jdc":
        return jdcFamily.createPlayerState();
      default:
        throw new Error(`Unbekannte Engine-Familie "${this.familyName}"`);
    }
  }

  private currentRandomTarget(): number {
    return this.randomTargets[this.randomTargetIndex];
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

  private applyThrow(state: PlayerState, visitThrows: Segment[]): ThrowResult {
    switch (this.familyName) {
      case "x01":
        return x01Family.applyThrow(state as x01Family.X01PlayerState, visitThrows, this.settings);
      case "random_checkout":
        return randomCheckoutFamily.applyThrow(state as randomCheckoutFamily.RandomCheckoutPlayerState, visitThrows);
      case "checkout_range":
        return checkoutRangeFamily.applyThrow(state as checkoutRangeFamily.CheckoutRangePlayerState, visitThrows, this.settings);
      case "catch":
        return catchFamily.applyThrow(state as catchFamily.CatchPlayerState, visitThrows);
      case "target_progression":
        return targetProgressionFamily.applyThrow(state as targetProgressionFamily.TargetProgressionPlayerState, visitThrows);
      case "accuracy_progression":
        return accuracyProgressionFamily.applyThrow(
          state as accuracyProgressionFamily.AccuracyProgressionPlayerState,
          visitThrows,
          this.settings
        );
      case "jdc":
        return jdcFamily.applyThrow(state as jdcFamily.JdcPlayerState, visitThrows);
      default:
        throw new Error(`Unbekannte Engine-Familie "${this.familyName}"`);
    }
  }

  // ------------------------------------------------------------ commit (nach Bestaetigung)
  private commitVisit(playerId: string, result: ThrowResult): void {
    const state = this.playerStates[playerId];
    const outcome = (result.outcome as string) ?? null;
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

    if (TASK_BASED_FAMILIES.has(this.familyName)) {
      // Spielerwechsel (IMMER nach jeder Aufnahme) und Versuchs-
      // Fortschritt ("Darts per Checkout" - mehrere eigene Aufnahmen
      // pro Versuch, abwechselnd mit den anderen Spielern) sind zwei
      // getrennte Berechnungen.
      this.commitTaskVisit(state, result);
      if (this.familyName === "checkout_range") this.maybeFinishCheckoutRange(playerId);
      else if (this.familyName === "catch") this.maybeFinishCatch(playerId);
      this.clearVisit();
      if (!this.finished) this.maybeAdvanceTaskRound();
      if (!this.finished) this.advanceToNextEligiblePlayer();
      return;
    }

    if (this.familyName === "target_progression") {
      state.score = result.score;
      state.targetIndex += 1;
      this.clearVisit();
      this.maybeFinishRun(playerId);
      if (!this.finished) this.advancePlayer();
      return;
    }

    if (this.familyName === "jdc") {
      jdcFamily.resolveVisit(state as jdcFamily.JdcPlayerState, result as jdcFamily.JdcThrowResult);
      this.clearVisit();
      this.maybeFinishJdc(playerId);
      if (!this.finished) this.advancePlayer();
      return;
    }

    if (this.familyName === "accuracy_progression") {
      // Jeder Spieler hat seine eigene Zahlenliste, das Spiel endet
      // SOFORT, wenn ein Spieler seine Liste leert - er gewinnt,
      // andere spielen nicht weiter (kein Ausgleich).
      accuracyProgressionFamily.resolveVisit(
        state as accuracyProgressionFamily.AccuracyProgressionPlayerState,
        result as accuracyProgressionFamily.AccuracyThrowResult
      );
      this.clearVisit();
      if (state.currentTarget === null) {
        this.finished = true;
        this.winnerId = playerId;
      }
      if (!this.finished) this.advancePlayer();
      return;
    }
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

  // Spielerwechsel passiert IMMER nach jeder Aufnahme (Takeout) - ohne
  // Ausnahme. Bei TASK_BASED_FAMILIES wird dabei aber ein Spieler
  // uebersprungen, der seinen Teil des laufenden Versuchs schon
  // abgeschlossen hat (Checkout geschafft oder alle eigenen Aufnahmen
  // verbraucht) - er bekommt keine weiteren Aufnahmen mehr, bis fuer
  // alle ein neuer Versuch beginnt (siehe maybeAdvanceTaskRound).
  private advanceToNextEligiblePlayer(): void {
    this.advancePlayer();
    if (!TASK_BASED_FAMILIES.has(this.familyName)) return;
    let guard = 0;
    while (this.playerStates[this.players[this.activeIndex].id].taskDone && guard < this.players.length) {
      this.advancePlayer();
      guard += 1;
    }
  }

  private visitsPerAttempt(): number {
    // Manche Spiele einer TASK_BASED_FAMILY legen "Darts per Checkout"
    // fest an der GameDefinition fest, statt es als Einstellung
    // anzubieten (z.B. 60 +/-: immer genau 3 Darts/1 Aufnahme, keine
    // Auswahl im Setup).
    const familyDefault = DEFAULT_DARTS_PER_CHECKOUT[this.familyName] ?? 9;
    const gameDefault = this.game.dartsPerCheckout ?? familyDefault;
    const darts = Number(this.settings.dartsPerCheckout ?? gameDefault);
    return Math.max(1, Math.floor(darts / VISIT_DART_CAP));
  }

  private taskNominalField(): string {
    return TASK_NOMINAL_FIELD[this.familyName] ?? "remaining";
  }

  // Wertet EINE Aufnahme innerhalb eines mehrteiligen Checkout-
  // Versuchs (TASK_BASED_FAMILIES). Getrennt vom Spielerwechsel.
  private commitTaskVisit(state: PlayerState, result: ThrowResult): void {
    const outcome = result.outcome as string;
    const nominalField = this.taskNominalField();

    if (outcome === "checkout") {
      // Checkout geschafft: dieser Spieler ist fuer den laufenden
      // Versuch fertig, auch wenn er noch Aufnahmen uebrig haette.
      this.resolveAttempt(state, true);
      state.taskDone = true;
      state.attemptRemaining = state[nominalField];
      return;
    }

    state.taskVisitsUsed += 1;
    const exhausted = state.taskVisitsUsed >= this.visitsPerAttempt();

    if (outcome === "bust" || exhausted) {
      state.attemptRemaining = state[nominalField];
    } else {
      state.attemptRemaining = result.score;
    }

    if (exhausted) {
      this.resolveAttempt(state, false);
      state.taskDone = true;
    }
  }

  private resolveAttempt(state: PlayerState, success: boolean): void {
    if (this.familyName === "checkout_range")
      checkoutRangeFamily.resolveAttempt(state as checkoutRangeFamily.CheckoutRangePlayerState, this.settings, success);
    else if (this.familyName === "random_checkout")
      randomCheckoutFamily.resolveAttempt(state as randomCheckoutFamily.RandomCheckoutPlayerState, this.settings, success);
    else if (this.familyName === "catch") catchFamily.resolveAttempt(state as catchFamily.CatchPlayerState, this.settings, success);
  }

  // Startet einen neuen Versuch fuer ALLE Spieler gemeinsam, sobald
  // jeder Spieler seinen Teil des laufenden Versuchs abgeschlossen hat.
  private maybeAdvanceTaskRound(): void {
    if (!this.players.every((p) => this.playerStates[p.id].taskDone)) return;
    if (this.familyName === "random_checkout") {
      this.nextRandomRound();
      if (this.finished) return;
    }
    const nominalField = this.taskNominalField();
    for (const p of this.players) {
      const s = this.playerStates[p.id];
      s.taskDone = false;
      s.taskVisitsUsed = 0;
      s.attemptRemaining = s[nominalField];
    }
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

  // ------------------------------------------------------------ random checkout rounds
  private nextRandomRound(): void {
    const endless = Boolean(this.settings.endless);
    this.randomTargetIndex += 1;
    if (this.randomTargetIndex >= this.randomTargets.length) {
      if (!endless) {
        this.finished = true;
        this.winnerId = this.players.reduce((best, p) => {
          const a = this.playerStates[p.id];
          const b = this.playerStates[best.id];
          if (a.successfulCheckouts !== b.successfulCheckouts) return a.successfulCheckouts > b.successfulCheckouts ? p : best;
          return a.attempts < b.attempts ? p : best;
        }).id;
        return;
      }
      // Endless: das naechste Ziel existiert noch nicht als Event -
      // confirmVisit()/correctThrow() rufen danach ensureEndlessTarget()
      // auf und spielen neu ab.
      return;
    }
    const target = this.currentRandomTarget();
    for (const p of this.players) this.playerStates[p.id].remaining = target;
  }

  // ------------------------------------------------------------ checkout_range (121 usw.)
  private maybeFinishCheckoutRange(playerId: string): void {
    const mode = (this.settings.gameLengthMode as string) ?? "targets_20";
    const state = this.playerStates[playerId];
    const maxLevel = Number(this.settings.maxLevel ?? 170);

    if (mode === "until_max") {
      if (state.highestLevel >= maxLevel) {
        this.finished = true;
        this.winnerId = playerId;
      }
      return;
    }
    if (mode === "endless") return;

    const fixedTargets: Record<string, number> = { targets_10: 10, targets_20: 20, targets_30: 30 };
    const targetAttempts = fixedTargets[mode] ?? Number(this.settings.customTargets ?? 20);

    const allDone = this.players.every((p) => this.playerStates[p.id].attempts >= targetAttempts);
    if (!allDone) return;
    this.finished = true;
    this.winnerId = this.players.reduce((best, p) => {
      const a = this.playerStates[p.id];
      const b = this.playerStates[best.id];
      if (a.highestLevel !== b.highestLevel) return a.highestLevel > b.highestLevel ? p : best;
      if (a.successfulCheckouts !== b.successfulCheckouts) return a.successfulCheckouts > b.successfulCheckouts ? p : best;
      return a.attempts < b.attempts ? p : best;
    }).id;
  }

  // ------------------------------------------------------------ catch (Catch 40 usw.)
  private maybeFinishCatch(playerId: string): void {
    // Kein Endless bei Catch 40/Easy - nur "kompletter Durchlauf" (=
    // Laenge der Zahlenfolge) oder eine kuerzere Custom-Anzahl.
    const mode = (this.settings.gameLengthMode as string) ?? "full";
    const targetAttempts = mode === "custom" ? Number(this.settings.customTargets ?? this.catchTargets.length) : this.catchTargets.length;

    const allDone = this.players.every((p) => this.playerStates[p.id].attempts >= targetAttempts);
    if (!allDone) return;
    this.finished = true;
    this.winnerId = this.players.reduce((best, p) => {
      const a = this.playerStates[p.id];
      const b = this.playerStates[best.id];
      if (a.successfulCheckouts !== b.successfulCheckouts) return a.successfulCheckouts > b.successfulCheckouts ? p : best;
      return a.attempts < b.attempts ? p : best;
    }).id;
  }

  // ------------------------------------------------------------ mehrteilige Runs (Bob's 27, JDC)
  // Wie viele Runs fuer den Match-Sieg noetig sind - "custom" liest die
  // Anzahl aus einer eigenen Einstellung, sonst der feste
  // BOBS27_MODE_RUNS-Wert. null = Endless (kein Zielwert).
  private runModeTarget(mode: string, customKey: string): number | null {
    if (mode === "custom") return Number(this.settings[customKey] ?? 3);
    return BOBS27_MODE_RUNS[mode] ?? null;
  }

  // ------------------------------------------------------------ bob's 27 runs
  private maybeFinishRun(playerId: string): void {
    const state = this.playerStates[playerId];
    if (state.targetIndex < state.targets.length) return; // diese Aufnahme war noch nicht das letzte Ziel

    state.totalScore += state.score;
    if (state.bestRun === null || state.score > state.bestRun) state.bestRun = state.score;
    state.runsCompleted += 1;

    const allDone = this.players.every((p) => {
      const s = this.playerStates[p.id];
      return s.targetIndex >= s.targets.length;
    });
    if (!allDone) return;

    const mode = (this.settings.mode as string) ?? "single";
    const runsTarget = this.runModeTarget(mode, "customRuns");
    const completed = Math.min(...this.players.map((p) => this.playerStates[p.id].runsCompleted));

    if (runsTarget !== null && completed >= runsTarget) {
      this.finished = true;
      this.winnerId = this.players.reduce((best, p) =>
        this.playerStates[p.id].totalScore > this.playerStates[best.id].totalScore ? p : best
      ).id;
      return;
    }

    for (const p of this.players) {
      const s = this.playerStates[p.id];
      s.targetIndex = 0;
      s.score = targetProgressionFamily.STARTING_SCORE;
    }
  }

  // ------------------------------------------------------------ jdc challenge runs
  private maybeFinishJdc(playerId: string): void {
    const state = this.playerStates[playerId] as jdcFamily.JdcPlayerState;
    if (state.phaseIndex < jdcFamily.PHASES.length) return; // Run noch nicht komplett

    state.totalScore += state.runScore;
    if (state.bestRun === null || state.runScore > state.bestRun) state.bestRun = state.runScore;
    state.runsCompleted += 1;

    const allDone = this.players.every((p) => (this.playerStates[p.id] as jdcFamily.JdcPlayerState).phaseIndex >= jdcFamily.PHASES.length);
    if (!allDone) return;

    const mode = (this.settings.mode as string) ?? "single";
    const runsTarget = this.runModeTarget(mode, "customRuns");
    const completed = Math.min(...this.players.map((p) => (this.playerStates[p.id] as jdcFamily.JdcPlayerState).runsCompleted));

    if (runsTarget !== null && completed >= runsTarget) {
      this.finished = true;
      this.winnerId = this.players.reduce((best, p) =>
        this.playerStates[p.id].totalScore > this.playerStates[best.id].totalScore ? p : best
      ).id;
      return;
    }

    for (const p of this.players) {
      const s = this.playerStates[p.id] as jdcFamily.JdcPlayerState;
      s.phaseIndex = 0;
      s.targetIndex = 0;
      s.phaseScores = { shanghai1: 0, doubles: 0, shanghai2: 0 };
      s.runScore = 0;
      s.totalHits = 0;
      s.shanghaiCount = 0;
    }
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
    return (result.score as number) ?? committed;
  }

  private targetDisplay(): string | null {
    const activeId = this.players[this.activeIndex].id;
    const state = this.playerStates[activeId];
    if (this.familyName === "target_progression") {
      return targetProgressionFamily.currentTarget(state as targetProgressionFamily.TargetProgressionPlayerState);
    }
    if (this.familyName === "accuracy_progression") {
      // Required Hits = 1: das Ziel kann sich INNERHALB der laufenden
      // Aufnahme mit jedem Dart aendern - live neu berechnen, ohne den
      // committeten State zu veraendern. Required Hits 2/3: Ziel
      // bleibt waehrend der Aufnahme gleich.
      const requiredHits = Number(this.settings.requiredHits ?? 1);
      let target: number | string | null;
      if (requiredHits === 1 && this.currentVisitThrows.length > 0) {
        const result = this.applyThrow(state, this.currentVisitThrows) as accuracyProgressionFamily.AccuracyThrowResult;
        target = result.endingTarget ?? state.currentTarget;
      } else {
        target = state.currentTarget;
      }
      return target !== null && target !== undefined ? String(target) : null;
    }
    if (this.familyName === "random_checkout") {
      const idx = Math.min(this.randomTargetIndex, this.randomTargets.length - 1);
      return this.randomTargets.length > 0 ? String(this.randomTargets[idx]) : null;
    }
    if (this.familyName === "checkout_range" || this.familyName === "catch") {
      return String(state.level);
    }
    if (this.familyName === "jdc") {
      // Doubles-Phase: das Ziel wechselt bei JEDEM Dart innerhalb der
      // Aufnahme (immer, nicht nur bei Treffer) - live neu berechnen.
      // Shanghai-Phasen: Ziel bleibt waehrend der Aufnahme gleich.
      const jdcState = state as jdcFamily.JdcPlayerState;
      if (jdcFamily.currentPhase(jdcState) === "doubles" && this.currentVisitThrows.length > 0) {
        const result = this.applyThrow(state, this.currentVisitThrows) as jdcFamily.JdcThrowResult;
        const targets = jdcFamily.PHASE_TARGETS.doubles;
        const idx = result.endingIndex ?? jdcState.targetIndex;
        const target = idx < targets.length ? targets[idx] : null;
        return target !== null ? String(target) : null;
      }
      const target = jdcFamily.currentTarget(jdcState);
      return target !== null ? String(target) : null;
    }
    return null;
  }

  private jdcPhaseLabel(): string | null {
    if (this.familyName !== "jdc") return null;
    const activeId = this.players[this.activeIndex].id;
    const phase = jdcFamily.currentPhase(this.playerStates[activeId] as jdcFamily.JdcPlayerState);
    return phase ? jdcFamily.PHASE_LABELS[phase] : null;
  }

  private checkoutSuggestion(): string[] | null {
    const CHECKOUT_SUGGESTION_FAMILIES = new Set(["x01", "random_checkout", "checkout_range", "catch"]);
    if (this.pendingConfirmation || !CHECKOUT_SUGGESTION_FAMILIES.has(this.familyName)) return null;
    const activeId = this.players[this.activeIndex].id;
    const remaining = this.liveScore(activeId);
    if (remaining === null) return null;
    const dartsLeft = VISIT_DART_CAP - this.currentVisitThrows.length;
    // "checkoutMode" ist nur bei x01 (170) und checkout_range (121)
    // ein Setting - andere Familien dieser Gruppe (Random Checkout,
    // Catch 40, 60 +/-) bleiben ueber den Default bei Double Out.
    const checkoutMode: CheckoutMode =
      this.familyName === "x01" || this.familyName === "checkout_range"
        ? ((this.settings.checkoutMode as CheckoutMode) ?? "double_out")
        : "double_out";
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
      phase: this.jdcPhaseLabel(),
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

function randomInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function shuffleInPlace<T>(values: T[]): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}
