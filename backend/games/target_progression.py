"""target_progression-Familie (aktuell: Bob's 27). Siehe SPEC §19 und
docs/ARCHITEKTUR.md Abschnitt 4.

Etablierte Bob's-27-Regel: pro Ziel (D1..D20, dann Bull) genau eine
Aufnahme mit 3 Darts. Jeder getroffene Dart bringt +2x die Zahl
(Bull = +50), werden alle 3 Darts verfehlt gibt es einmalig -2x die
Zahl. Danach IMMER zum naechsten Ziel wechseln (wie Around the World).
"""
from __future__ import annotations

BOBS27_TARGETS = [f"D{n}" for n in range(1, 21)] + ["BULL"]
STARTING_SCORE = 27


def create_player_state() -> dict:
    return {
        "score": STARTING_SCORE,
        "targetIndex": 0,
        "runsCompleted": 0,
        "totalScore": 0,
        "bestRun": None,
    }


def current_target(state: dict) -> str | None:
    if state["targetIndex"] >= len(BOBS27_TARGETS):
        return None
    return BOBS27_TARGETS[state["targetIndex"]]


def visit_dart_cap(settings: dict) -> int:
    return 3


def _target_matches(target_label: str, segment: dict) -> bool:
    if target_label == "BULL":
        return segment.get("number") == 25 and segment.get("multiplier") == 2
    number = int(target_label[1:])
    return segment.get("number") == number and segment.get("multiplier") == 2


def _target_value(target_label: str) -> int:
    if target_label == "BULL":
        return 50
    return int(target_label[1:]) * 2


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    """Wird nach jedem Dart aufgerufen, wertet aber erst, wenn die
    Aufnahme (3 Darts) komplett ist - Bob's 27 zaehlt Treffer der
    kompletten Aufnahme, nicht Dart fuer Dart."""
    if len(visit_throws) < visit_dart_cap(settings):
        return {"outcome": "continue", "score": player_state["score"]}

    target_label = current_target(player_state)
    hits = sum(1 for t in visit_throws if _target_matches(target_label, t))
    value = _target_value(target_label)
    delta = value * hits if hits > 0 else -value
    return {"outcome": "target_done", "score": player_state["score"] + delta, "hits": hits}
