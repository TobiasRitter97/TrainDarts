"""x01-Familie (aktuell: 170). Siehe docs/ARCHITEKTUR.md Abschnitt 4.

Checkout-Regel (SPEC-Erweiterung, mit Tobias abgestimmt 08.09.2026):
"checkoutMode" ("double_out"/"master_out"/"straight_out") ersetzt den
frueheren reinen "doubleOut"-Toggle - siehe
backend/engine/scoring.py:apply_countdown_throw.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw

STARTING_SCORE = 170


def create_player_state() -> dict:
    return {"score": STARTING_SCORE, "legsWon": 0, "setsWon": 0, "highestCheckout": 0}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    return apply_countdown_throw(player_state["score"], visit_throws, settings.get("checkoutMode", "double_out"))
