"""accuracy_progression-Familie (aktuell: Around the World). Siehe
docs/ARCHITEKTUR.md Abschnitt 4.

2. Korrektur (08.09.2026, SPEC §24 - komplett ersetzt): Jeder Spieler
hat seine EIGENE, unabhaengige Liste offener Zahlen (1-20, optional
Bull). Das Spiel endet sofort, sobald EIN Spieler seine Liste leert -
dieser Spieler gewinnt, andere spielen nicht weiter (kein Ausgleich).
Kein "Game Length"/Runs-Konzept mehr.

Required Hits = 1 (Sonderregel): innerhalb EINER Aufnahme wird bei
jedem Treffer sofort zur naechsten offenen Zahl gewechselt (fuer den
naechsten Dart derselben Aufnahme) - eine Aufnahme kann so mehrere
verschiedene Zahlen erledigen. Nicht getroffene Zahlen bleiben Ziel
fuer den naechsten Dart derselben Aufnahme (kein Wechsel bei Fehlwurf).

Required Hits = 2/3: alle 3 Darts einer Aufnahme immer auf dieselbe
Zahl. Genug Treffer -> Zahl wird aus der Liste entfernt. Nicht genug
Treffer -> Zahl bleibt in der Liste (kommt bei einem spaeteren
Durchlauf wieder dran), das naechste Ziel wandert TROTZDEM zur
naechsten Zahl in der Liste weiter (kein sofortiges Wiederholen).

In beiden Faellen ist das naechste Ziel danach die naechste Zahl IN
DER URSPRUENGLICHEN LISTENREIHENFOLGE (mit Wraparound, sobald das Ende
der - ggf. schon verkuerzten - Liste erreicht ist): das ergibt genau
den geforderten "erster Durchlauf 1-20(+Bull), danach nur noch die
offenen Zahlen in urspruenglicher Reihenfolge, wiederholt bis leer".
"""
from __future__ import annotations


def build_open_numbers(settings: dict) -> list:
    numbers: list = list(range(1, 21))
    if bool(settings.get("includeBull", False)):
        numbers.append("BULL")
    return numbers


def create_player_state(open_numbers: list) -> dict:
    return {
        "openNumbers": list(open_numbers),
        "currentTarget": open_numbers[0] if open_numbers else None,
        "successfulTargets": 0,
        "totalHits": 0,
        "totalDarts": 0,
        "singles": 0,
        "doubles": 0,
        "triples": 0,
        "perfectTargets": 0,
    }


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


def _next_after(open_numbers: list, value) -> object:
    """Naechste Zahl NACH value in der aktuellen Listenreihenfolge, mit
    Wraparound - unabhaengig davon, ob value hinterher entfernt wird
    oder nicht (siehe Moduldoc: in beiden Faellen dieselbe naechste
    Zahl)."""
    idx = open_numbers.index(value)
    return open_numbers[(idx + 1) % len(open_numbers)]


def _simulate_required_hits_1(open_numbers: list, start_target, visit_throws: list[dict], segment_mode: str) -> dict:
    """Reine Berechnung (kein Seiteneffekt) der automatischen
    Zielwechsel-Logik innerhalb EINER Aufnahme bei Required Hits = 1."""
    remaining = list(open_numbers)
    target = start_target
    hit_numbers: list = []
    hit_kinds_per_dart: list[str | None] = []
    for segment in visit_throws:
        if target is None:
            hit_kinds_per_dart.append(None)
            continue
        kind = _hit_kind(segment, target)
        hit_kinds_per_dart.append(kind if _qualifies(kind, segment_mode) else None)
        if _qualifies(kind, segment_mode):
            hit_numbers.append(target)
            remaining.remove(target)
            target = remaining[0] if remaining else None
    return {"endingTarget": target, "hitNumbers": hit_numbers, "hitKindsPerDart": hit_kinds_per_dart}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    required_hits = int(settings.get("requiredHits", 1))
    segment_mode = settings.get("segmentMode", "single")

    if required_hits == 1:
        sim = _simulate_required_hits_1(player_state["openNumbers"], player_state["currentTarget"], visit_throws, segment_mode)
        outcome = "target_done" if len(visit_throws) >= 3 else "continue"
        return {
            "outcome": outcome,
            "endingTarget": sim["endingTarget"],
            "hitNumbers": sim["hitNumbers"],
            "hitKindsPerDart": sim["hitKindsPerDart"],
        }

    # Required Hits 2/3: alle 3 Darts immer auf dieselbe Zahl - erst
    # nach dem 3. Dart wird gewertet.
    if len(visit_throws) < 3:
        return {"outcome": "continue"}
    target = player_state["currentTarget"]
    open_numbers = player_state["openNumbers"]
    hit_kinds_per_dart = [_hit_kind(t, target) for t in visit_throws]
    qualifying = sum(1 for h in hit_kinds_per_dart if _qualifies(h, segment_mode))
    success = qualifying >= required_hits
    return {
        "outcome": "target_done",
        "endingTarget": _next_after(open_numbers, target),
        "hitNumbers": [target] if success else [],
        "hitKindsPerDart": hit_kinds_per_dart,
    }


def resolve_visit(player_state: dict, result: dict) -> None:
    """Wird von der Engine GENAU EINMAL nach jeder abgeschlossenen
    Aufnahme aufgerufen - entfernt erledigte Zahlen aus der Liste,
    setzt das naechste Ziel und schreibt die Trefferstatistik fort."""
    hit_kinds = result["hitKindsPerDart"]
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
    if len(hits) == 3:
        player_state["perfectTargets"] += 1

    for number in result["hitNumbers"]:
        if number in player_state["openNumbers"]:
            player_state["openNumbers"].remove(number)
            player_state["successfulTargets"] += 1

    if not player_state["openNumbers"]:
        player_state["currentTarget"] = None  # Liste leer - Spieler hat gewonnen
        return
    ending = result["endingTarget"]
    player_state["currentTarget"] = ending if ending in player_state["openNumbers"] else player_state["openNumbers"][0]
