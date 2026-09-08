"""random_checkout-Familie (Random Checkout). Siehe SPEC §25 und
docs/ARCHITEKTUR.md Abschnitt 4.

3. Korrektur (08.09.2026, SPEC §25): Spielerwechsel und Versuchs-
Fortschritt sind getrennt (siehe backend/engine/engine.py,
TASK_BASED_FAMILIES/_commit_task_visit). "Darts per Checkout" gibt
JEDEM Spieler mehrere eigene 3-Darts-Aufnahmen fuer denselben
(geteilten, fairen) Checkout-Wert - abwechselnd, nicht am Stueck: nach
jeder Aufnahme wechselt trotzdem sofort der Spieler. Die geteilte
Zufallszahl pro Versuch erzeugt weiterhin die MatchEngine (Fairness,
SPEC §8), aber erst wenn ALLE Spieler ihren Teil des Versuchs
abgeschlossen haben. "remaining" ist der nominale (geteilte)
Zielwert des laufenden/naechsten Versuchs; der laufende Fortschritt
innerhalb des Versuchs steckt in player_state["attemptRemaining"]
(von der Engine verwaltet).
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(target: int) -> dict:
    return {"remaining": target, "successfulCheckouts": 0, "attempts": 0}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Double-Out ist beim Checkout-Training immer an - kein eigener
    # Schalter in den Settings (SPEC §25 nennt keinen). Basis ist der
    # ueber mehrere eigene Aufnahmen hinweg mitgefuehrte Rest des
    # laufenden Versuchs, nicht der nominale (geteilte) Zielwert.
    return apply_countdown_throw(player_state["attemptRemaining"], visit_throws, "double_out")


def resolve_attempt(player_state: dict, settings: dict, success: bool) -> None:
    """Wird von der Engine GENAU EINMAL pro Spieler und Versuch
    aufgerufen - entweder sofort bei Checkout (auch wenn noch eigene
    Aufnahmen uebrig waeren) oder wenn dieser Spieler alle seine
    Aufnahmen fuer den Versuch verbraucht hat, ohne zu checken."""
    player_state["attempts"] += 1
    if success:
        player_state["successfulCheckouts"] += 1
