"""
checkout_range-Familie (aktuell: 121; spaeter Catch 40, Catch 40 Easy,
60 +/- - docs/ARCHITEKTUR.md Abschnitt 4). Ein Spieler arbeitet sich
unabhaengig von den anderen durch eine Folge von Checkout-Zahlen.

Ein Versuch (Aufgabe) darf bis zu dartsPerCheckout Darts nutzen, was
bei mehr als 3 Darts mehrere Aufnahmen (Board-Takeouts) umfasst -
"level" ist das stabile Ziel des laufenden Versuchs (aendert sich nur,
wenn der Versuch abgeschlossen ist), "remaining" der Rest INNERHALB
des Versuchs (sinkt ueber die Aufnahmen hinweg, springt bei Bust auf
den Stand vor der Aufnahme zurueck). Das Zaehlen der Aufnahmen und das
Auswerten "Versuch fertig oder nicht" macht MatchEngine
(dartsUsedInTask), nicht diese Datei.

Safehouse-Regel (121, SPEC §18): im SPEC nicht bis ins Detail
definiert - mit Tobias abgestimmte Interpretation (02.09.2026):
Checkpoints alle 10 Nummern ab dem Startwert (Standard) bzw. alle 5
(Easy). Bei einem gescheiterten Versuch faellt der Spieler auf die
zuletzt erreichte Checkpoint-Nummer zurueck statt auf die aktuelle
Zahl oder ganz auf den Startwert. "Off" = kein Ruecksprung.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(settings: dict) -> dict:
    start = int(settings.get("startLevel", 121))
    return {
        "level": start,
        "remaining": start,
        "dartsUsedInTask": 0,
        "highestLevel": start,
        "successfulCheckouts": 0,
        "attempts": 0,
    }


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Checkout-Versuche laufen immer mit Double-Out (SPEC nennt keinen
    # eigenen Schalter fuer diese Familie).
    return apply_countdown_throw(player_state["remaining"], visit_throws, True)


def _safehouse_interval(settings: dict) -> int | None:
    mode = settings.get("safehouseMode", "standard")
    if mode == "standard":
        return 10
    if mode == "easy":
        return 5
    return None  # "off" (oder Spiele ohne Safehouse-Konzept) - kein Ruecksprung


def resolve_attempt(player_state: dict, settings: dict, success: bool) -> None:
    """Wird EINMAL pro abgeschlossenem Versuch aufgerufen (Checkout
    geschafft ODER Dart-Budget verbraucht) - schreibt level/highestLevel/
    Stats fort und bereitet "remaining" fuer den naechsten Versuch vor."""
    start = int(settings.get("startLevel", 121))
    max_level = int(settings.get("maxLevel", 170))
    player_state["attempts"] += 1

    if success:
        achieved = player_state["level"]
        player_state["successfulCheckouts"] += 1
        player_state["highestLevel"] = max(player_state["highestLevel"], achieved)
        delta = int(settings.get("onSuccessDelta", 1))
        player_state["level"] = min(achieved + delta, max_level)
    else:
        interval = _safehouse_interval(settings)
        if interval is None:
            delta = int(settings.get("onFailDelta", 0))
            player_state["level"] = max(start, player_state["level"] + delta)
        else:
            current = player_state["level"]
            player_state["level"] = start + interval * ((current - start) // interval)

    player_state["remaining"] = player_state["level"]
