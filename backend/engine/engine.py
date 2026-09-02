"""
MatchEngine: generische Turn-/Runden-/Leg-Logik ueber allen
Engine-Familien. Siehe docs/ARCHITEKTUR.md Abschnitt 2 und 3.

Bewusst OHNE Event-Log/Persistenz fuer Phase 7 (siehe ARCHITEKTUR.md
"Game Engine (Event Sourcing)") - der State lebt nur im Speicher des
laufenden Prozesses. Event-Sourcing (fuer Correction/Undo) kommt in
Phase 8 dazu, wenn es tatsaechlich gebraucht wird.
"""
from __future__ import annotations

import random

from backend.adapter.autodarts import throw_label
from backend.engine.checkout import suggest_route
from backend.engine.scoring import segment_value
from backend.games import random_checkout as random_checkout_family
from backend.games import target_progression as target_progression_family
from backend.games import x01 as x01_family

FAMILIES = {
    "x01": x01_family,
    "target_progression": target_progression_family,
    "random_checkout": random_checkout_family,
}

# Welche Wurf-Ergebnisse eine Aufnahme sofort beenden (statt erst nach
# Erreichen von visit_dart_cap()).
FORCES_VISIT_END = {
    "x01": {"bust", "checkout"},
    "random_checkout": {"checkout"},  # Bust nutzt trotzdem das volle Dart-Budget (SPEC §25)
    "target_progression": {"target_done"},
}

X01_MATCH_MODE_LEGS = {"1_leg": 1, "bo3": 2, "bo5": 3, "bo7": 4}
BOBS27_MODE_RUNS = {"single": 1, "bo3": 3, "bo5": 5}


class MatchEngine:
    def __init__(self, match_id: str, game: dict, players: list[dict], settings: dict):
        self.match_id = match_id
        self.game = game
        self.players = players  # [{id, name, color, initials}, ...] in Sitzreihenfolge
        self.settings = settings
        self.family_name = game["engineFamily"]
        self.family = FAMILIES[self.family_name]

        self.active_index = 0
        self.current_visit_throws: list[dict] = []
        self.round_number = 1
        self.leg_number = 1
        self.starting_player_index = 0

        self.finished = False
        self.winner_id: str | None = None

        self.random_targets: list[int] = []
        self.random_target_index = 0
        if self.family_name == "random_checkout":
            self._init_random_checkout()

        self.player_states = {p["id"]: self._create_player_state() for p in self.players}

    # ------------------------------------------------------------ setup
    def _create_player_state(self) -> dict:
        if self.family_name == "random_checkout":
            return random_checkout_family.create_player_state(self._current_random_target())
        if self.family_name == "target_progression":
            return target_progression_family.create_player_state()
        return x01_family.create_player_state()

    def _init_random_checkout(self) -> None:
        lo = int(self.settings.get("minCheckout", 40))
        hi = int(self.settings.get("maxCheckout", 120))
        endless = bool(self.settings.get("endless", False))
        count = int(self.settings.get("numberOfCheckouts", 20)) if not endless else 1
        self.random_targets = [random.randint(lo, hi) for _ in range(max(count, 1))]

    def _current_random_target(self) -> int:
        return self.random_targets[self.random_target_index]

    # ------------------------------------------------------------ throws
    def handle_throw(self, label: str, raw: dict) -> None:
        if self.finished:
            return
        segment = raw.get("segment", {})
        self.current_visit_throws.append(segment)

        active_id = self.players[self.active_index]["id"]
        state = self.player_states[active_id]

        result = self.family.apply_throw(state, self.current_visit_throws, self.settings)

        cap = self.family.visit_dart_cap(self.settings)
        forces_end = result.get("outcome") in FORCES_VISIT_END.get(self.family_name, set())
        visit_complete = forces_end or len(self.current_visit_throws) >= cap

        if visit_complete:
            self._end_visit(active_id, result)

    def _live_score(self, player_id: str) -> int | None:
        """Score/Remaining fuer die Anzeige. Waehrend einer laufenden
        Aufnahme frisch berechnet (fuer den dart-fuer-dart mitzaehlenden
        Restscore), OHNE den committeten State zu veraendern - der
        bleibt bewusst der Stand vom Beginn der Aufnahme, bis
        _end_visit() ihn tatsaechlich fortschreibt (siehe scoring.py:
        ein Bust rechnet sonst faelschlich vom bereits verringerten
        Wert weiter statt vom Aufnahme-Start)."""
        state = self.player_states[player_id]
        committed = state.get("score", state.get("remaining"))
        is_active = player_id == self.players[self.active_index]["id"]
        if not is_active or not self.current_visit_throws or self.family_name not in ("x01", "random_checkout"):
            return committed
        result = self.family.apply_throw(state, self.current_visit_throws, self.settings)
        return result.get("score", committed)

    # ------------------------------------------------------------ visit end
    def _end_visit(self, player_id: str, result: dict) -> None:
        state = self.player_states[player_id]
        outcome = result.get("outcome")
        checkout_value = sum(segment_value(t) for t in self.current_visit_throws)

        if self.family_name == "x01":
            state["score"] = result["score"]
            if outcome == "checkout":
                state["legsWon"] += 1
                if checkout_value > state["highestCheckout"]:
                    state["highestCheckout"] = checkout_value
                self._maybe_finish_match_x01(player_id)
                if not self.finished:
                    self._start_new_leg()
                    self.current_visit_throws = []
                    return  # _start_new_leg hat den naechsten Spieler schon gesetzt

        elif self.family_name == "random_checkout":
            state["remaining"] = result["score"]
            if outcome == "checkout":
                state["successfulCheckouts"] += 1
            state["attempts"] += 1

        elif self.family_name == "target_progression":
            state["score"] = result["score"]
            state["targetIndex"] += 1

        self.current_visit_throws = []

        if self.family_name == "random_checkout" and self.active_index == len(self.players) - 1:
            self._next_random_round()
        if self.family_name == "target_progression":
            self._maybe_finish_run(player_id)

        if not self.finished:
            self._advance_player()

    def _advance_player(self) -> None:
        # Rundengrenze relativ zum Startspieler dieses Legs/Runs, nicht
        # zu Index 0 - bei 170 rotiert der Startspieler pro Leg.
        last_of_round_index = (self.starting_player_index - 1) % len(self.players)
        was_last = self.active_index == last_of_round_index
        self.active_index = (self.active_index + 1) % len(self.players)
        if was_last:
            self.round_number += 1

    # ------------------------------------------------------------ x01 legs
    def _match_mode_target(self) -> int | None:
        mode = self.settings.get("matchMode", "bo3")
        if mode in X01_MATCH_MODE_LEGS:
            return X01_MATCH_MODE_LEGS[mode]
        if mode == "custom":
            return int(self.settings.get("customLegsToWin", 3))
        return None  # endless

    def _maybe_finish_match_x01(self, winner_id: str) -> None:
        target = self._match_mode_target()
        if target is not None and self.player_states[winner_id]["legsWon"] >= target:
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
            lo = int(self.settings.get("minCheckout", 40))
            hi = int(self.settings.get("maxCheckout", 120))
            self.random_targets.append(random.randint(lo, hi))
        target = self._current_random_target()
        for p in self.players:
            self.player_states[p["id"]]["remaining"] = target

    # ------------------------------------------------------------ bob's 27 runs
    def _maybe_finish_run(self, player_id: str) -> None:
        state = self.player_states[player_id]
        if state["targetIndex"] < len(target_progression_family.BOBS27_TARGETS):
            return  # diese Aufnahme war noch nicht das letzte Ziel

        state["totalScore"] += state["score"]
        if state["bestRun"] is None or state["score"] > state["bestRun"]:
            state["bestRun"] = state["score"]
        state["runsCompleted"] += 1

        all_done = all(
            self.player_states[p["id"]]["targetIndex"] >= len(target_progression_family.BOBS27_TARGETS)
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
    def _target_display(self) -> str | None:
        active_id = self.players[self.active_index]["id"]
        state = self.player_states[active_id]
        if self.family_name == "target_progression":
            return target_progression_family.current_target(state)
        if self.family_name == "random_checkout":
            # Nach dem letzten Checkout (Match beendet) zeigt der Index
            # ggf. schon hinter das letzte generierte Ziel - auf den
            # letzten gueltigen Wert begrenzen statt abzustuerzen.
            idx = min(self.random_target_index, len(self.random_targets) - 1)
            return str(self.random_targets[idx])
        return None

    def _checkout_suggestion(self) -> list[str] | None:
        if self.family_name not in ("x01", "random_checkout"):
            return None
        active_id = self.players[self.active_index]["id"]
        remaining = self._live_score(active_id)
        darts_left = self.family.visit_dart_cap(self.settings) - len(self.current_visit_throws)
        double_out = True if self.family_name == "random_checkout" else self.settings.get("doubleOut", True)
        return suggest_route(remaining, darts_left, double_out)

    def to_dict(self) -> dict:
        active_player = self.players[self.active_index]
        return {
            "matchId": self.match_id,
            "gameId": self.game["id"],
            "gameName": self.game["name"],
            "engineFamily": self.family_name,
            "players": [self._player_display(p) for p in self.players],
            "activePlayerId": active_player["id"],
            "currentVisitThrows": [throw_label(s) for s in self.current_visit_throws],
            "target": self._target_display(),
            "checkoutSuggestion": self._checkout_suggestion(),
            "round": self.round_number,
            "legNumber": self.leg_number if self.family_name == "x01" else None,
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
            "highestCheckout": state.get("highestCheckout"),
            "runsCompleted": state.get("runsCompleted"),
            "totalScore": state.get("totalScore"),
            "bestRun": state.get("bestRun"),
            "successfulCheckouts": state.get("successfulCheckouts"),
            "attempts": state.get("attempts"),
        }
