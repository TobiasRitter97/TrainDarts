"""target_progression-Familie (aktuell: Bob's 27, Bob's 27 Easy). Siehe
SPEC §19/§20 und docs/ARCHITEKTUR.md Abschnitt 4.

Etablierte Bob's-27-Regel: pro Ziel (Route siehe unten) genau eine
Aufnahme mit 3 Darts. Jeder getroffene Dart bringt +2x die Zahl
(Bull = +50), werden alle 3 Darts verfehlt gibt es einmalig -2x die
Zahl. Danach IMMER zum naechsten Ziel wechseln (wie Around the World).

Die Ziel-Route ist zentral hier konfiguriert (SPEC §20: "zentral
konfigurierbar machen und nicht hart in UI-Komponenten verteilen") und
wird der GameDefinition in backend/config/games.py als "targets"
mitgegeben - Bob's 27 und Bob's 27 Easy nutzen dieselbe Engine/UI,
unterscheiden sich nur in dieser Liste.
"""
from __future__ import annotations

BOBS27_TARGETS = [f"D{n}" for n in range(1, 21)] + ["BULL"]

# Easy-Route (mit Tobias abgestimmt, 08.09.2026): jedes zweite Doppel -
# deckt weiterhin das ganze Board ab, aber mit halb so vielen Zielen.
BOBS27_EASY_TARGETS = [f"D{n}" for n in range(2, 21, 2)] + ["BULL"]

STARTING_SCORE = 27


def create_player_state(targets: list[str]) -> dict:
    return {
        "score": STARTING_SCORE,
        "targetIndex": 0,
        "runsCompleted": 0,
        "totalScore": 0,
        "bestRun": None,
        "targets": targets,
    }


def current_target(state: dict) -> str | None:
    targets = state["targets"]
    if state["targetIndex"] >= len(targets):
        return None
    return targets[state["targetIndex"]]


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
    if len(visit_throws) < 3:  # eine Aufnahme = 3 Darts (Engine-weite Konstante, siehe engine.py)
        return {"outcome": "continue", "score": player_state["score"]}

    target_label = current_target(player_state)
    hits = sum(1 for t in visit_throws if _target_matches(target_label, t))
    value = _target_value(target_label)
    delta = value * hits if hits > 0 else -value
    return {"outcome": "target_done", "score": player_state["score"] + delta, "hits": hits}
