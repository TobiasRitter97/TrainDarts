"""
checkout_range-Familie (aktuell: 121; spaeter Catch 40, Catch 40 Easy,
60 +/- - docs/ARCHITEKTUR.md Abschnitt 4). Ein Spieler arbeitet sich
unabhaengig von den anderen durch eine Folge von Checkout-Zahlen.

Safehouse-Regel (121, SPEC §18): im SPEC nicht bis ins Detail
definiert - mit Tobias abgestimmte Interpretation (02.09.2026):
Checkpoints alle 10 Nummern ab dem Startwert (Standard) bzw. alle 5
(Easy). Bei einem gescheiterten Checkout faellt der Spieler auf die
zuletzt erreichte Checkpoint-Nummer zurueck statt auf die aktuelle
Zahl oder ganz auf den Startwert. "Off" = kein Ruecksprung.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(settings: dict) -> dict:
    start = int(settings.get("startLevel", 121))
    return {"level": start, "highestLevel": start, "successfulCheckouts": 0, "attempts": 0}


def visit_dart_cap(settings: dict) -> int:
    return int(settings.get("dartsPerCheckout", 9))


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Checkout-Versuche laufen immer mit Double-Out (SPEC nennt keinen
    # eigenen Schalter fuer diese Familie).
    return apply_countdown_throw(player_state["level"], visit_throws, True)


def _safehouse_interval(settings: dict) -> int | None:
    mode = settings.get("safehouseMode", "standard")
    if mode == "standard":
        return 10
    if mode == "easy":
        return 5
    return None  # "off" (oder Spiele ohne Safehouse-Konzept) - kein Ruecksprung


def resolve_attempt(player_state: dict, settings: dict, success: bool) -> None:
    """Wird EINMAL pro abgeschlossenem Versuch aufgerufen (nach der
    Aufnahme-Bestaetigung) - schreibt level/highestLevel/Stats fort."""
    start = int(settings.get("startLevel", 121))
    max_level = int(settings.get("maxLevel", 170))
    player_state["attempts"] += 1

    if success:
        achieved = player_state["level"]
        player_state["successfulCheckouts"] += 1
        player_state["highestLevel"] = max(player_state["highestLevel"], achieved)
        delta = int(settings.get("onSuccessDelta", 1))
        player_state["level"] = min(achieved + delta, max_level)
        return

    interval = _safehouse_interval(settings)
    if interval is None:
        delta = int(settings.get("onFailDelta", 0))
        player_state["level"] = max(start, player_state["level"] + delta)
        return
    current = player_state["level"]
    player_state["level"] = start + interval * ((current - start) // interval)
