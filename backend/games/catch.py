"""catch-Familie (Catch 40, Catch 40 Easy). Siehe SPEC §7 (Catch 40 als
Beispiel fuer mehrteilige Aufgaben), §8 (Fairness: alle Spieler
durchlaufen dieselbe Zahlenfolge), §21/§22 und docs/ARCHITEKTUR.md
Abschnitt 4.

Jeder Spieler durchlaeuft unabhaengig von den anderen dieselbe (bei
Shuffle: gemeinsam gemischte) Zahlenfolge - wie target_progression
(Bob's 27/Around the World), aber mit bis zu 6 Darts (2 Aufnahmen)
statt genau einer Aufnahme pro Ziel (nutzt deshalb dieselbe
TASK_BASED_FAMILIES-Maschinerie wie checkout_range/random_checkout,
siehe backend/engine/engine.py).

Anders als bei checkout_range (121) geht es nach jeder Zahl IMMER zur
naechsten weiter, egal ob Checkout geschafft oder nicht - kein
Stehenbleiben, kein Safehouse. Nur genau EIN Durchgang moeglich (kein
Endless) - mit Tobias abgestimmt (08.09.2026): das Spiel dauert durch
die feste Range schon lang genug.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(targets: list[int]) -> dict:
    return {
        "level": targets[0] if targets else 0,
        "targetIndex": 0,
        "targets": targets,
        "successfulCheckouts": 0,
        "attempts": 0,
    }


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Immer Double-Out (SPEC nennt keinen eigenen Schalter fuer diese
    # Familie). Basis ist der ueber mehrere eigene Aufnahmen hinweg
    # mitgefuehrte Rest des laufenden Versuchs, nicht die nominale Zahl.
    return apply_countdown_throw(player_state["attemptRemaining"], visit_throws, True)


def resolve_attempt(player_state: dict, settings: dict, success: bool) -> None:
    """Wird von der Engine GENAU EINMAL pro Spieler und Zahl aufgerufen -
    entweder bei Checkout oder wenn die 6 Darts (2 Aufnahmen) verbraucht
    sind. Anders als bei checkout_range geht es IMMER zur naechsten Zahl
    weiter, unabhaengig vom Erfolg - der Erfolg zaehlt nur fuer die
    Statistik (successfulCheckouts)."""
    player_state["attempts"] += 1
    if success:
        player_state["successfulCheckouts"] += 1
    player_state["targetIndex"] += 1
    targets = player_state["targets"]
    if player_state["targetIndex"] < len(targets):
        player_state["level"] = targets[player_state["targetIndex"]]
