"""random_checkout-Familie (Random Checkout). Siehe SPEC §25 und
docs/ARCHITEKTUR.md Abschnitt 4.

Die geteilte Zufallszahl pro Runde erzeugt die MatchEngine (Fairness,
SPEC §8) - diese Familie kuemmert sich nur um die Countdown-Logik.
Ein Versuch (Aufgabe) darf bis zu dartsPerCheckout Darts nutzen
(3/6/9/12), was bei mehr als 3 Darts mehrere Aufnahmen (Board-Takeouts)
umfasst - das Zaehlen der Aufnahmen und das Auswerten "Aufgabe fertig
oder nicht" macht MatchEngine (dartsUsedInTask), nicht diese Datei.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(target: int) -> dict:
    return {"remaining": target, "dartsUsedInTask": 0, "successfulCheckouts": 0, "attempts": 0}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Double-Out ist beim Checkout-Training immer an - kein eigener
    # Schalter in den Settings (SPEC §25 nennt keinen).
    return apply_countdown_throw(player_state["remaining"], visit_throws, True)
