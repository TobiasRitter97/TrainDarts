"""x01-Familie (aktuell: 170). Siehe docs/ARCHITEKTUR.md Abschnitt 4."""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw

STARTING_SCORE = 170


def create_player_state() -> dict:
    return {"score": STARTING_SCORE, "legsWon": 0, "setsWon": 0, "highestCheckout": 0}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    return apply_countdown_throw(player_state["score"], visit_throws, settings.get("doubleOut", True))
