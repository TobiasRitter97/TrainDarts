"""accuracy_progression-Familie (aktuell: Around the World). Siehe
SPEC §24 und docs/ARCHITEKTUR.md Abschnitt 4.

Wichtigste Regel (SPEC §24): nach JEDER Aufnahme (3 Darts) wird IMMER
zur naechsten Zahl gewechselt - unabhaengig von der Trefferzahl. Genau
wie target_progression (Bob's 27): eine Aufnahme = ein Ziel, kein
mehrteiliger Versuch. Anders als Bob's 27 gibt es aber keinen
Punktestand - getrackt werden Trefferstatistiken (SPEC "Wertung"):
erfolgreiche Targets, Treffer gesamt, Singles/Doubles/Triples,
Perfect Targets.

Nicht mit Tobias abgestimmt, eigene Interpretation (08.09.2026): Singles/
Doubles/Triples/Treffer-gesamt zaehlen JEDEN Treffer auf die Zielzahl,
unabhaengig vom eingestellten Segment Mode (fuer eine vollstaendige
Diagnose). "Perfect Target" heisst dagegen: alle 3 Darts waren
QUALIFIZIERENDE Treffer nach Segment Mode + Required Hits - bei
Segment Mode "Double" also 3x Double auf die Zielzahl in einer
Aufnahme. Falls das nicht Tobias' Vorstellung entspricht, bitte
melden.
"""
from __future__ import annotations


def build_targets(settings: dict) -> list:
    targets: list = list(range(1, 21))
    if bool(settings.get("includeBull", False)):
        targets.append("BULL")
    return targets


def create_player_state(targets: list) -> dict:
    return {
        "targetIndex": 0,
        "targets": targets,
        "successfulTargets": 0,
        "totalHits": 0,
        "totalDarts": 0,
        "singles": 0,
        "doubles": 0,
        "triples": 0,
        "perfectTargets": 0,
        "runsCompleted": 0,
    }


def current_target(state: dict):
    targets = state["targets"]
    if state["targetIndex"] >= len(targets):
        return None
    return targets[state["targetIndex"]]


def _hit_kind(segment: dict, target) -> str | None:
    """'single'/'double'/'triple', falls dieser Wurf ein Treffer auf die
    aktuelle Zielzahl ist, sonst None. Bull kennt kein Triple."""
    number = segment.get("number")
    multiplier = segment.get("multiplier")
    if target == "BULL":
        if number != 25:
            return None
        return {1: "single", 2: "double"}.get(multiplier)
    if number != target:
        return None
    return {1: "single", 2: "double", 3: "triple"}.get(multiplier)


def _qualifies(hit_kind: str | None, segment_mode: str) -> bool:
    if hit_kind is None:
        return False
    if segment_mode == "all":
        return True
    return hit_kind == segment_mode


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    """Wird nach jedem Dart aufgerufen, wertet aber erst wenn die
    Aufnahme (3 Darts) komplett ist - wie Bob's 27."""
    if len(visit_throws) < 3:
        return {"outcome": "continue"}
    target = current_target(player_state)
    segment_mode = settings.get("segmentMode", "single")
    required_hits = int(settings.get("requiredHits", 1))
    hit_kinds = [_hit_kind(t, target) for t in visit_throws]
    qualifying_count = sum(1 for h in hit_kinds if _qualifies(h, segment_mode))
    return {
        "outcome": "target_done",
        "success": qualifying_count >= required_hits,
        "hitKinds": hit_kinds,
        "qualifyingCount": qualifying_count,
    }


def resolve_target(player_state: dict, result: dict) -> None:
    """Wird von der Engine GENAU EINMAL nach jeder abgeschlossenen
    Aufnahme aufgerufen - schreibt die Trefferstatistik fort und
    wechselt IMMER zur naechsten Zahl (SPEC §24), unabhaengig vom
    Erfolg."""
    hit_kinds = result["hitKinds"]
    hits = [h for h in hit_kinds if h is not None]
    player_state["totalDarts"] += len(hit_kinds)
    player_state["totalHits"] += len(hits)
    for h in hits:
        if h == "single":
            player_state["singles"] += 1
        elif h == "double":
            player_state["doubles"] += 1
        elif h == "triple":
            player_state["triples"] += 1
    if result["success"]:
        player_state["successfulTargets"] += 1
    if result["qualifyingCount"] == 3:
        player_state["perfectTargets"] += 1
    player_state["targetIndex"] += 1
