"""
checkout_range-Familie (aktuell: 121; spaeter Catch 40, Catch 40 Easy,
60 +/- - docs/ARCHITEKTUR.md Abschnitt 4). Ein Spieler arbeitet sich
unabhaengig von den anderen durch eine Folge von Checkout-Zahlen.

3. Korrektur (08.09.2026, SPEC §18): Spielerwechsel und Versuchs-
Fortschritt sind getrennt (siehe backend/engine/engine.py,
TASK_BASED_FAMILIES/_commit_task_visit). Ein Versuch umfasst
"Darts per Checkout" Darts, aufgeteilt in mehrere eigene 3-Darts-
Aufnahmen - nach JEDER Aufnahme wechselt trotzdem sofort der Spieler,
die anderen werfen dazwischen ihre eigenen Aufnahmen fuer denselben
Versuch. "level" ist der nominale Zielwert des laufenden/naechsten
Versuchs und aendert sich nur, wenn ein Spieler seinen Teil des
Versuchs abschliesst (siehe resolve_attempt) - der laufende
Fortschritt innerhalb des Versuchs steckt in player_state
["attemptRemaining"] (von der Engine verwaltet).

Safehouse-Regel (SPEC §18): im SPEC nicht bis ins Detail definiert -
mit Tobias abgestimmte Interpretation (02.09.2026): Checkpoints alle
10 Nummern ab dem Startwert (Standard) bzw. alle 5 (Easy). Bei einem
gescheiterten Versuch faellt der Spieler auf die zuletzt erreichte
Checkpoint-Nummer zurueck statt auf die aktuelle Zahl oder ganz auf
den Startwert. "Off" = kein Ruecksprung. Spiele ohne "safehouseMode"-
Einstellung im Schema (z.B. 60 +/-, SPEC §23) bekommen automatisch
"Off" (siehe _safehouse_interval) - Safehouse ist ein 121-spezifisches
Konzept, kein Familien-Standard.

Bei 60 +/- (SPEC §23, mit Tobias abgestimmt 08.09.2026): Untergrenze
beim Startwert (wie bei 121s "Off"-Modus), aber KEINE Obergrenze -
"maxLevel" ist deshalb optional; ist die Einstellung nicht vorhanden
(kein Schema-Feld dafuer), wird gar nicht erst gedeckelt.
"""
from __future__ import annotations

from backend.engine.scoring import apply_countdown_throw


def create_player_state(settings: dict) -> dict:
    start = int(settings.get("startLevel", 121))
    return {"level": start, "highestLevel": start, "successfulCheckouts": 0, "attempts": 0}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    # Checkout-Regel konfigurierbar (SPEC-Erweiterung, mit Tobias
    # abgestimmt 08.09.2026, bei 121 - Spiele derselben Familie ohne
    # eigenes "Checkout"-Setting wie 60 +/- bleiben ueber den Default
    # bei Double Out). Basis ist der ueber mehrere eigene Aufnahmen
    # hinweg mitgefuehrte Rest des laufenden Versuchs, nicht der
    # nominale Zielwert.
    return apply_countdown_throw(
        player_state["attemptRemaining"], visit_throws, settings.get("checkoutMode", "double_out")
    )


def _safehouse_interval(settings: dict) -> int | None:
    mode = settings.get("safehouseMode", "off")
    if mode == "standard":
        return 10
    if mode == "easy":
        return 5
    return None  # "off" (oder Spiele ohne Safehouse-Konzept) - kein Ruecksprung


def resolve_attempt(player_state: dict, settings: dict, success: bool) -> None:
    """Wird von der Engine GENAU EINMAL pro Spieler und Versuch
    aufgerufen - entweder sofort bei Checkout (auch wenn noch eigene
    Aufnahmen uebrig waeren) oder wenn dieser Spieler alle seine
    Aufnahmen fuer den Versuch verbraucht hat, ohne zu checken.
    Schreibt level/highestLevel/Stats fort."""
    start = int(settings.get("startLevel", 121))
    max_level = settings.get("maxLevel")
    player_state["attempts"] += 1

    if success:
        achieved = player_state["level"]
        player_state["successfulCheckouts"] += 1
        player_state["highestLevel"] = max(player_state["highestLevel"], achieved)
        delta = int(settings.get("onSuccessDelta", 1))
        new_level = achieved + delta
        if max_level is not None:
            new_level = min(new_level, int(max_level))
        player_state["level"] = new_level
        return

    interval = _safehouse_interval(settings)
    if interval is None:
        delta = int(settings.get("onFailDelta", 0))
        player_state["level"] = max(start, player_state["level"] + delta)
        return
    current = player_state["level"]
    player_state["level"] = start + interval * ((current - start) // interval)
