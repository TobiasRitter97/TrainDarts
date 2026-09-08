"""random_checkout-Familie (Random Checkout). Siehe SPEC §25 und
docs/ARCHITEKTUR.md Abschnitt 4.

Korrektur (08.09.2026): Ein Versuch ist GENAU EINE Aufnahme (3 Darts) -
kein mehrteiliger Versuch mehr, egal ob geschafft oder nicht (auch bei
Bust wechselt sofort der Spieler). Die geteilte Zufallszahl pro Runde
erzeugt die MatchEngine (Fairness, SPEC §8) - diese Familie kuemmert
sich nur um die Countdown-Logik der einzelnen Aufnahme.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(target: int) -> dict:
    return {"remaining": target, "successfulCheckouts": 0, "attempts": 0}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Double-Out ist beim Checkout-Training immer an - kein eigener
    # Schalter in den Settings (SPEC §25 nennt keinen).
    return apply_countdown_throw(player_state["remaining"], visit_throws, True)
