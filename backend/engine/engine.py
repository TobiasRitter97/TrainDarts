"""
MatchEngine mit echtem Event-Sourcing (docs/ARCHITEKTUR.md Abschnitt 1,
2.1, 7.2). Der Spielzustand ist IMMER ein Replay des Event-Logs -
Korrektur und Undo aendern nur das Log, nie den State direkt.

Event-Typen:
  MATCH_STARTED           - einmalig, traegt bei random_checkout die
                             vorab erzeugte Zufallssequenz
  THROW                    - {throwSeq, segment, source}
  VISIT_CONFIRMED          - Takeout-Bestaetigung (Abschnitt 2.1)
  CORRECT_THROW             - {targetThrowSeq, segment}
  ROUND_RANDOM_GENERATED   - neues Zufallsziel fuer Endless-Runden,
                             erst bei Bedarf erzeugt, danach im Log
                             fest (sonst waere Replay nicht deterministisch)
"""
from __future__ import annotations

import random

from backend.adapter.autodarts import throw_label
from backend.engine.checkout import suggest_route
from backend.engine.scoring import segment_value
from backend.games import checkout_range as checkout_range_family
from backend.games import random_checkout as random_checkout_family
from backend.games import target_progression as target_progression_family
from backend.games import x01 as x01_family

FAMILIES = {
    "x01": x01_family,
    "target_progression": target_progression_family,
    "random_checkout": random_checkout_family,
    "checkout_range": checkout_range_family,
}

# Welche Wurf-Ergebnisse eine Aufnahme sofort "pending" machen (statt
# erst nach Erreichen von VISIT_DART_CAP Darts). Ein Bust oder Checkout
# beendet die aktuelle Aufnahme immer sofort, unabhaengig davon, ob der
# gesamte Checkout-Versuch damit schon abgeschlossen ist.
FORCES_VISIT_END = {
    "x01": {"bust", "checkout"},
    "random_checkout": {"bust", "checkout"},
    "checkout_range": {"bust", "checkout"},
    "target_progression": {"target_done"},
}

# Feldname im jeweiligen player_state, der den "Countdown"-Wert traegt
# (fuer Live-Anzeige und Checkout-Vorschlag generisch nutzbar). Bei
# checkout_range/random_checkout ist das der ueber mehrere eigene
# Aufnahmen hinweg mitgefuehrte Rest INNERHALB des laufenden Versuchs
# (siehe TASK_BASED_FAMILIES) - nicht der nominale Zielwert.
COUNTDOWN_FIELD = {
    "x01": "score",
    "target_progression": "score",
    "random_checkout": "attemptRemaining",
    "checkout_range": "attemptRemaining",
}

# Engine-weite Konstante: eine Aufnahme (Board-Takeout) ist physikalisch
# immer 3 Darts, unabhaengig vom Spiel.
VISIT_DART_CAP = 3

# Korrektur (08.09.2026, 3. Fassung, SPEC §18/§25): Spielerwechsel und
# Versuchs-Fortschritt sind ZWEI GETRENNTE Dinge. Nach JEDER Aufnahme
# (Takeout) wechselt immer der Spieler (siehe _advance_to_next_eligible_
# player). Die Einstellung "Darts per Checkout" bestimmt unabhaengig
# davon, wie viele eigene Aufnahmen ein Spieler insgesamt fuer EINEN
# Checkout-Versuch bekommt (abwechselnd mit den anderen Spielern, nicht
# am Stueck) - siehe _commit_task_visit/_maybe_advance_task_round.
TASK_BASED_FAMILIES = {"checkout_range", "random_checkout"}
DEFAULT_DARTS_PER_CHECKOUT = {"checkout_range": 9, "random_checkout": 6}

X01_MATCH_MODE_LEGS = {"1_leg": 1, "bo3": 2, "bo5": 3, "bo7": 4}
BOBS27_MODE_RUNS = {"single": 1, "bo3": 3, "bo5": 5}

HISTORY_LIMIT = 3  # wie viele abgeschlossene Aufnahmen fuer Korrektur sichtbar bleiben


class MatchEngine:
    def __init__(self, match_id: str, game: dict, players: list[dict], settings: dict,
                 events: list[dict] | None = None):
        self.match_id = match_id
        self.game = game
        self.players = players  # [{id, name, color, initials}, ...] in Sitzreihenfolge
        self.settings = settings
        self.family_name = game["engineFamily"]
        self.family = FAMILIES[self.family_name]

        self.events: list[dict] = []

        if events:
            # Aus der Persistenz wiederhergestellt (Fortsetzen nach Neustart).
            self.events = list(events)
        else:
            payload = {}
            if self.family_name == "random_checkout":
                payload["randomTargets"] = self._generate_random_targets()
            self._append("MATCH_STARTED", payload)

        self._replay()

    # ------------------------------------------------------------ Event-Log
    def _append(self, event_type: str, payload: dict) -> None:
        self.events.append({"type": event_type, "payload": payload})

    def _next_throw_seq(self) -> int:
        seqs = [e["payload"]["throwSeq"] for e in self.events if e["type"] == "THROW"]
        return (max(seqs) + 1) if seqs else 0

    def handle_throw(self, label: str, raw: dict, source: str = "auto") -> bool:
        """Neuer Wurf vom Board (oder manuell via + DART). Waehrend eine
        Aufnahme auf Bestaetigung wartet, werden keine weiteren Darts
        gezaehlt - erst confirm_visit() oder correct_throw() aendern
        wieder etwas."""
        if self.finished or self.pending_confirmation:
            return False
        segment = raw.get("segment", {})
        self._append("THROW", {"throwSeq": self._next_throw_seq(), "segment": segment, "source": source})
        self._replay()
        return True

    def add_manual_throw(self, segment: dict) -> bool:
        """+ DART (SPEC §15): manuell erfasster Dart, technisch identisch
        zu einem automatisch erkannten Wurf."""
        return self.handle_throw(throw_label(segment), {"segment": segment}, source="manual")

    def confirm_visit(self) -> bool:
        """Takeout-Bestaetigung (Abschnitt 2.1) oder manueller
        "Aufnahme bestaetigen"-Fallback. Erst danach greifen
        Spielerwechsel, Leg-/Run-Wechsel, Highscores."""
        if not self.current_visit_throws:
            return False
        self._append("VISIT_CONFIRMED", {})
        self._replay()
        self._ensure_endless_target()
        return True

    def correct_throw(self, target_throw_seq: int, segment: dict) -> bool:
        """Korrigiert einen beliebigen Wurf (aktuelle ODER vergangene
        Aufnahme, SPEC §14/§16) - der urspruengliche Wurf bleibt im Log
        stehen, gilt beim Replay aber als ersetzt."""
        if not any(e["type"] == "THROW" and e["payload"]["throwSeq"] == target_throw_seq for e in self.events):
            return False
        self._append("CORRECT_THROW", {"targetThrowSeq": target_throw_seq, "segment": segment})
        self._replay()
        self._ensure_endless_target()
        return True

    def undo(self) -> bool:
        """Entfernt das letzte Event (Wurf, Bestaetigung oder Korrektur)
        und spielt neu ab - macht dadurch automatisch auch bereits
        vollzogene Spieler-/Leg-Wechsel rueckgaengig (SPEC §16)."""
        if len(self.events) <= 1:  # nur MATCH_STARTED uebrig
            return False
        self.events.pop()
        self._replay()
        return True

    def _ensure_endless_target(self) -> None:
        """Erzeugt bei Bedarf das naechste Zufallsziel fuer Endless
        Random Checkout - als eigenes Event, damit Replay deterministisch
        bleibt (kein random.randint() waehrend _replay())."""
        if self.family_name != "random_checkout" or self.finished:
            return
        if not bool(self.settings.get("endless", False)):
            return
        if self.random_target_index < len(self.random_targets):
            return
        lo = int(self.settings.get("minCheckout", 40))
        hi = int(self.settings.get("maxCheckout", 120))
        self._append("ROUND_RANDOM_GENERATED", {"value": random.randint(lo, hi)})
        self._replay()

    def _generate_random_targets(self) -> list[int]:
        lo = int(self.settings.get("minCheckout", 40))
        hi = int(self.settings.get("maxCheckout", 120))
        endless = bool(self.settings.get("endless", False))
        count = int(self.settings.get("numberOfCheckouts", 20)) if not endless else 1
        return [random.randint(lo, hi) for _ in range(max(count, 1))]

    # ------------------------------------------------------------ Replay
    def _replay(self) -> None:
        self.active_index = 0
        self.current_visit_throws: list[dict] = []
        self.current_visit_seqs: list[int] = []
        self.round_number = 1
        self.leg_number = 1
        self.set_number = 1
        self.starting_player_index = 0
        self.finished = False
        self.winner_id: str | None = None
        self.pending_confirmation = False
        self.pending_outcome: str | None = None
        self.visit_history: list[dict] = []

        self.random_target_index = 0
        self.random_targets: list[int] = list(self.events[0]["payload"].get("randomTargets", []))

        self.player_states = {p["id"]: self._create_player_state() for p in self.players}

        corrections: dict[int, dict] = {}
        for e in self.events:
            if e["type"] == "CORRECT_THROW":
                corrections[e["payload"]["targetThrowSeq"]] = e["payload"]["segment"]

        for e in self.events:
            if e["type"] == "THROW":
                throw_seq = e["payload"]["throwSeq"]
                segment = corrections.get(throw_seq, e["payload"]["segment"])
                self._replay_throw(segment, throw_seq)
            elif e["type"] == "VISIT_CONFIRMED":
                self._replay_confirm()
            elif e["type"] == "ROUND_RANDOM_GENERATED":
                self.random_targets.append(e["payload"]["value"])

    def _create_player_state(self) -> dict:
        if self.family_name == "random_checkout":
            target = self.random_targets[0] if self.random_targets else 0
            state = random_checkout_family.create_player_state(target)
            return self._init_task_fields(state, "remaining")
        if self.family_name == "target_progression":
            targets = self.game.get("targets", target_progression_family.BOBS27_TARGETS)
            return target_progression_family.create_player_state(targets)
        if self.family_name == "checkout_range":
            state = checkout_range_family.create_player_state(self.settings)
            return self._init_task_fields(state, "level")
        return x01_family.create_player_state()

    @staticmethod
    def _init_task_fields(state: dict, nominal_field: str) -> dict:
        """Ergaenzt den per-Versuch-Fortschritt (TASK_BASED_FAMILIES):
        attemptRemaining ist der ueber mehrere eigene Aufnahmen hinweg
        mitgefuehrte Rest des laufenden Versuchs, taskVisitsUsed zaehlt
        die dafuer bereits verbrauchten eigenen Aufnahmen, taskDone
        markiert, ob dieser Spieler seinen Teil des Versuchs schon
        abgeschlossen hat (Checkout geschafft ODER alle Aufnahmen
        verbraucht)."""
        state["attemptRemaining"] = state[nominal_field]
        state["taskVisitsUsed"] = 0
        state["taskDone"] = False
        return state

    def _current_random_target(self) -> int:
        return self.random_targets[self.random_target_index]

    def _replay_throw(self, segment: dict, throw_seq: int) -> None:
        if self.finished or self.pending_confirmation:
            # Kann bei einer Korrektur passieren, die eine fruehere
            # Aufnahme rueckwirkend zum Bust/Checkout macht - danach
            # geworfene Darts derselben (jetzt schon abgeschlossenen)
            # Aufnahme werden beim Replay bewusst ignoriert.
            return
        self.current_visit_throws.append(segment)
        self.current_visit_seqs.append(throw_seq)

        active_id = self.players[self.active_index]["id"]
        state = self.player_states[active_id]
        result = self.family.apply_throw(state, self.current_visit_throws, self.settings)

        forces_end = result.get("outcome") in FORCES_VISIT_END.get(self.family_name, set())
        if forces_end or len(self.current_visit_throws) >= VISIT_DART_CAP:
            self.pending_confirmation = True
            self.pending_outcome = result.get("outcome")

    def _replay_confirm(self) -> None:
        if not self.current_visit_throws:
            return  # nichts zu bestaetigen (z.B. doppeltes Takeout-Event)
        active_id = self.players[self.active_index]["id"]
        state = self.player_states[active_id]
        result = self.family.apply_throw(state, self.current_visit_throws, self.settings)
        self._commit_visit(active_id, result)
        self.pending_confirmation = False
        self.pending_outcome = None

    # ------------------------------------------------------------ commit (nach Bestaetigung)
    def _commit_visit(self, player_id: str, result: dict) -> None:
        state = self.player_states[player_id]
        outcome = result.get("outcome")
        checkout_value = sum(segment_value(t) for t in self.current_visit_throws)

        self.visit_history.append({
            "playerId": player_id,
            "throws": [
                {"throwSeq": seq, "label": throw_label(seg)}
                for seq, seg in zip(self.current_visit_seqs, self.current_visit_throws)
            ],
        })
        self.visit_history = self.visit_history[-HISTORY_LIMIT:]

        if self.family_name == "x01":
            state["score"] = result["score"]
            if outcome == "checkout":
                state["legsWon"] += 1
                if checkout_value > state["highestCheckout"]:
                    state["highestCheckout"] = checkout_value
                self._maybe_finish_match_x01(player_id)
                if not self.finished:
                    self._start_new_leg()
                    self._clear_visit()
                    return  # _start_new_leg hat den naechsten Spieler schon gesetzt
            self._clear_visit()
            if not self.finished:
                self._advance_player()
            return

        if self.family_name in TASK_BASED_FAMILIES:
            # 3. Korrektur (08.09.2026, SPEC §18/§25): Spielerwechsel
            # (IMMER nach jeder Aufnahme, siehe _advance_to_next_eligible_
            # player) und Versuchs-Fortschritt ("Darts per Checkout" -
            # mehrere eigene Aufnahmen pro Versuch, abwechselnd mit den
            # anderen Spielern) sind zwei getrennte Berechnungen.
            self._commit_task_visit(state, result)
            if self.family_name == "checkout_range":
                self._maybe_finish_checkout_range(player_id)
            self._clear_visit()
            if not self.finished:
                self._maybe_advance_task_round()
            if not self.finished:
                self._advance_to_next_eligible_player()
            return

        if self.family_name == "target_progression":
            state["score"] = result["score"]
            state["targetIndex"] += 1
            self._clear_visit()
            self._maybe_finish_run(player_id)
            if not self.finished:
                self._advance_player()
            return

    def _clear_visit(self) -> None:
        self.current_visit_throws = []
        self.current_visit_seqs = []

    def _advance_player(self) -> None:
        # Rundengrenze relativ zum Startspieler dieses Legs/Runs, nicht
        # zu Index 0 - bei 170 rotiert der Startspieler pro Leg.
        last_of_round_index = (self.starting_player_index - 1) % len(self.players)
        was_last = self.active_index == last_of_round_index
        self.active_index = (self.active_index + 1) % len(self.players)
        if was_last:
            self.round_number += 1

    def _advance_to_next_eligible_player(self) -> None:
        """Spielerwechsel passiert IMMER nach jeder Aufnahme (Takeout) -
        ohne Ausnahme. Bei TASK_BASED_FAMILIES wird dabei aber ein
        Spieler uebersprungen, der seinen Teil des laufenden Versuchs
        schon abgeschlossen hat (Checkout geschafft oder alle eigenen
        Aufnahmen verbraucht) - er bekommt keine weiteren Aufnahmen mehr,
        bis fuer alle ein neuer Versuch beginnt (siehe
        _maybe_advance_task_round)."""
        self._advance_player()
        if self.family_name not in TASK_BASED_FAMILIES:
            return
        guard = 0
        while (
            self.player_states[self.players[self.active_index]["id"]]["taskDone"]
            and guard < len(self.players)
        ):
            self._advance_player()
            guard += 1

    def _visits_per_attempt(self) -> int:
        default = DEFAULT_DARTS_PER_CHECKOUT.get(self.family_name, 9)
        darts = int(self.settings.get("dartsPerCheckout", default))
        return max(1, darts // VISIT_DART_CAP)

    def _task_nominal_field(self) -> str:
        return "level" if self.family_name == "checkout_range" else "remaining"

    def _commit_task_visit(self, state: dict, result: dict) -> None:
        """Wertet EINE Aufnahme innerhalb eines mehrteiligen Checkout-
        Versuchs (TASK_BASED_FAMILIES). Getrennt vom Spielerwechsel
        (siehe _advance_to_next_eligible_player)."""
        outcome = result.get("outcome")
        nominal_field = self._task_nominal_field()

        if outcome == "checkout":
            # Checkout geschafft: dieser Spieler ist fuer den laufenden
            # Versuch fertig, auch wenn er noch Aufnahmen uebrig haette -
            # seine Zielzahl steigt sofort, andere Spieler bekommen davon
            # unbeeinflusst weiterhin all ihre eigenen Aufnahmen auf den
            # bisherigen Wert.
            self.family.resolve_attempt(state, self.settings, True)
            state["taskDone"] = True
            state["attemptRemaining"] = state[nominal_field]  # Anzeige: sofort die neue Zielzahl
            return

        state["taskVisitsUsed"] += 1
        exhausted = state["taskVisitsUsed"] >= self._visits_per_attempt()

        if outcome == "bust" or exhausted:
            # Bust: Aufnahme verbraucht, Rest springt sofort zurueck auf
            # den Versuchs-Startwert. Erschoepft (letzte Aufnahme ohne
            # Checkout, kein Bust): Versuch fuer diesen Spieler vorbei -
            # Anzeige zeigt dann ebenfalls wieder den (unveraenderten)
            # Startwert statt eines veralteten Zwischenstands.
            state["attemptRemaining"] = state[nominal_field]
        else:
            # Aufnahme weder Bust noch Checkout, Versuch fuer diesen
            # Spieler laeuft weiter: Fortschritt wird fuer die naechste
            # eigene Aufnahme in diesem Versuch mitgefuehrt.
            state["attemptRemaining"] = result["score"]

        if exhausted:
            # Alle eigenen Aufnahmen fuer diesen Versuch verbraucht, ohne
            # zu checken -> Versuch fuer diesen Spieler gescheitert.
            self.family.resolve_attempt(state, self.settings, False)
            state["taskDone"] = True

    def _maybe_advance_task_round(self) -> None:
        """Startet einen neuen Versuch fuer ALLE Spieler gemeinsam, sobald
        jeder Spieler seinen Teil des laufenden Versuchs abgeschlossen
        hat (Checkout oder alle eigenen Aufnahmen verbraucht)."""
        if not all(self.player_states[p["id"]]["taskDone"] for p in self.players):
            return
        if self.family_name == "random_checkout":
            self._next_random_round()
            if self.finished:
                return
        nominal_field = self._task_nominal_field()
        for p in self.players:
            s = self.player_states[p["id"]]
            s["taskDone"] = False
            s["taskVisitsUsed"] = 0
            s["attemptRemaining"] = s[nominal_field]

    # ------------------------------------------------------------ x01 legs
    def _sets_enabled(self) -> bool:
        return bool(self.settings.get("setsEnabled", False))

    def _match_mode_target(self) -> int | None:
        mode = self.settings.get("matchMode", "bo3")
        if mode in X01_MATCH_MODE_LEGS:
            return X01_MATCH_MODE_LEGS[mode]
        if mode == "custom":
            return int(self.settings.get("customLegsToWin", 3))
        return None  # endless

    def _maybe_finish_match_x01(self, winner_id: str) -> None:
        """Bei aktivierten Sets (SPEC §17) ersetzt die Sets-Logik den
        Match-Mode-Legziel komplett - "Legs pro Set" entscheidet den
        Satz, "Sets zum Sieg" das Match. Ohne Sets bleibt es beim
        bisherigen Match-Mode-Legziel."""
        if bool(self.settings.get("setsEnabled", False)):
            self._maybe_finish_set_x01(winner_id)
            return
        target = self._match_mode_target()
        if target is not None and self.player_states[winner_id]["legsWon"] >= target:
            self.finished = True
            self.winner_id = winner_id

    def _maybe_finish_set_x01(self, winner_id: str) -> None:
        legs_per_set = int(self.settings.get("legsPerSet", 3))
        sets_to_win = int(self.settings.get("setsToWin", 2))
        state = self.player_states[winner_id]
        if state["legsWon"] < legs_per_set:
            return  # Satz innerhalb dieses Sets noch nicht entschieden
        state["setsWon"] += 1
        for p in self.players:
            self.player_states[p["id"]]["legsWon"] = 0
        self.set_number += 1
        self.leg_number = 0  # _start_new_leg() zaehlt gleich wieder auf 1 hoch
        if state["setsWon"] >= sets_to_win:
            self.finished = True
            self.winner_id = winner_id

    def _start_new_leg(self) -> None:
        self.leg_number += 1
        self.starting_player_index = (self.starting_player_index + 1) % len(self.players)
        self.active_index = self.starting_player_index
        self.round_number = 1
        for p in self.players:
            self.player_states[p["id"]]["score"] = x01_family.STARTING_SCORE

    # ------------------------------------------------------------ random checkout rounds
    def _next_random_round(self) -> None:
        endless = bool(self.settings.get("endless", False))
        self.random_target_index += 1
        if self.random_target_index >= len(self.random_targets):
            if not endless:
                self.finished = True
                self.winner_id = max(
                    self.players,
                    key=lambda p: (
                        self.player_states[p["id"]]["successfulCheckouts"],
                        -self.player_states[p["id"]]["attempts"],
                    ),
                )["id"]
                return
            # Endless: das naechste Ziel existiert noch nicht als Event -
            # confirm_visit()/correct_throw() rufen danach
            # _ensure_endless_target() auf und spielen neu ab.
            return
        target = self._current_random_target()
        for p in self.players:
            self.player_states[p["id"]]["remaining"] = target

    # ------------------------------------------------------------ checkout_range (121 usw.)
    def _maybe_finish_checkout_range(self, player_id: str) -> None:
        mode = self.settings.get("gameLengthMode", "targets_20")
        state = self.player_states[player_id]
        max_level = int(self.settings.get("maxLevel", 170))

        if mode == "until_max":
            if state["highestLevel"] >= max_level:
                self.finished = True
                self.winner_id = player_id
            return
        if mode == "endless":
            return

        target_attempts = {"targets_10": 10, "targets_20": 20, "targets_30": 30}.get(mode)
        if target_attempts is None:
            target_attempts = int(self.settings.get("customTargets", 20))

        all_done = all(self.player_states[p["id"]]["attempts"] >= target_attempts for p in self.players)
        if not all_done:
            return
        self.finished = True
        self.winner_id = max(
            self.players,
            key=lambda p: (
                self.player_states[p["id"]]["highestLevel"],
                self.player_states[p["id"]]["successfulCheckouts"],
                -self.player_states[p["id"]]["attempts"],
            ),
        )["id"]

    # ------------------------------------------------------------ bob's 27 runs
    def _maybe_finish_run(self, player_id: str) -> None:
        state = self.player_states[player_id]
        if state["targetIndex"] < len(state["targets"]):
            return  # diese Aufnahme war noch nicht das letzte Ziel

        state["totalScore"] += state["score"]
        if state["bestRun"] is None or state["score"] > state["bestRun"]:
            state["bestRun"] = state["score"]
        state["runsCompleted"] += 1

        all_done = all(
            self.player_states[p["id"]]["targetIndex"] >= len(self.player_states[p["id"]]["targets"])
            for p in self.players
        )
        if not all_done:
            return

        mode = self.settings.get("mode", "single")
        runs_target = BOBS27_MODE_RUNS.get(mode)
        completed = min(self.player_states[p["id"]]["runsCompleted"] for p in self.players)

        if runs_target is not None and completed >= runs_target:
            self.finished = True
            self.winner_id = max(self.players, key=lambda p: self.player_states[p["id"]]["totalScore"])["id"]
            return

        for p in self.players:
            s = self.player_states[p["id"]]
            s["targetIndex"] = 0
            s["score"] = target_progression_family.STARTING_SCORE

    # ------------------------------------------------------------ display
    def _live_score(self, player_id: str) -> int | None:
        """Countdown-Wert (score/remaining/level, siehe COUNTDOWN_FIELD)
        fuer die Anzeige. Waehrend einer laufenden (nicht bestaetigten)
        Aufnahme frisch berechnet, ohne den committeten State zu
        veraendern."""
        field = COUNTDOWN_FIELD.get(self.family_name)
        if field is None:
            return None
        state = self.player_states[player_id]
        committed = state.get(field)
        is_active = player_id == self.players[self.active_index]["id"]
        if not is_active or not self.current_visit_throws:
            return committed
        result = self.family.apply_throw(state, self.current_visit_throws, self.settings)
        return result.get("score", committed)

    def _target_display(self) -> str | None:
        active_id = self.players[self.active_index]["id"]
        state = self.player_states[active_id]
        if self.family_name == "target_progression":
            return target_progression_family.current_target(state)
        if self.family_name == "random_checkout":
            idx = min(self.random_target_index, len(self.random_targets) - 1)
            return str(self.random_targets[idx]) if self.random_targets else None
        if self.family_name == "checkout_range":
            return str(state["level"])
        return None

    def _checkout_suggestion(self) -> list[str] | None:
        if self.pending_confirmation or self.family_name not in ("x01", "random_checkout", "checkout_range"):
            return None
        active_id = self.players[self.active_index]["id"]
        remaining = self._live_score(active_id)
        darts_left = VISIT_DART_CAP - len(self.current_visit_throws)
        double_out = self.settings.get("doubleOut", True) if self.family_name == "x01" else True
        return suggest_route(remaining, darts_left, double_out)

    def to_dict(self) -> dict:
        active_player = self.players[self.active_index]
        return {
            "matchId": self.match_id,
            "gameId": self.game["id"],
            "gameName": self.game["name"],
            "engineFamily": self.family_name,
            "settings": self.settings,
            "players": [self._player_display(p) for p in self.players],
            "activePlayerId": active_player["id"],
            "currentVisitThrows": [
                {"throwSeq": seq, "label": throw_label(seg)}
                for seq, seg in zip(self.current_visit_seqs, self.current_visit_throws)
            ],
            "target": self._target_display(),
            "checkoutSuggestion": self._checkout_suggestion(),
            "round": self.round_number,
            "legNumber": self.leg_number if self.family_name == "x01" else None,
            "setNumber": self.set_number if (self.family_name == "x01" and self._sets_enabled()) else None,
            "pendingConfirmation": self.pending_confirmation,
            "pendingOutcome": self.pending_outcome,
            "history": self.visit_history,
            "canUndo": len(self.events) > 1,
            "finished": self.finished,
            "winnerId": self.winner_id,
            "winnerName": next((p["name"] for p in self.players if p["id"] == self.winner_id), None),
        }

    def _player_display(self, player: dict) -> dict:
        state = self.player_states[player["id"]]
        return {
            "id": player["id"],
            "name": player["name"],
            "score": self._live_score(player["id"]),
            "legsWon": state.get("legsWon"),
            "setsWon": state.get("setsWon"),
            "highestCheckout": state.get("highestCheckout"),
            "highestLevel": state.get("highestLevel"),
            "runsCompleted": state.get("runsCompleted"),
            "totalScore": state.get("totalScore"),
            "bestRun": state.get("bestRun"),
            "successfulCheckouts": state.get("successfulCheckouts"),
            "attempts": state.get("attempts"),
        }
