"""jdc-Familie (JDC Challenge). Siehe SPEC §26.

SPEC §26 verlangt explizit "etablierte JDC-Challenge-Regeln, nicht
selbst erfinden". Recherchiert (08.09.2026, per Web-Recherche, 4 von 5
unabhaengigen Quellen stimmen ueberein - dolfdarts.com, dartsdude.com,
godartspro.com, mydartpfeil.com abweichend bei Wiederholungen):

Phase 1 - Shanghai 10-15: pro Zahl GENAU EINE Aufnahme (3 Darts).
Jeder Treffer auf die Zielzahl zaehlt mit seinem Wert (Single/Double/
Triple), ein Treffer je Multiplikator in derselben Aufnahme (1x S, 1x D,
1x T derselben Zahl) = "Shanghai" = +100 Bonus obendrauf.

Phase 2 - Doubles 1-20 + Bull: EIN Dart pro Doppel, 21 Darts gesamt
(= exakt 7 Dreier-Aufnahmen, geht ohne Rest auf). Jedes getroffene
Doppel = 50 Punkte (unabhaengig von der Zahl), Bull: Single Bull = 50,
Bullseye = 100 (50 + 50 Bonus). Mit Tobias abgestimmt (08.09.2026): da
ein Board-Takeout physisch immer nach 3 Darts kommt, bleibt eine
Aufnahme auch hier 3 Darts - dabei wandert das Ziel bei JEDEM Dart
automatisch zum naechsten Doppel weiter (unabhaengig von Treffer/
Fehlwurf, anders als Around the World Required Hits=1), Spielerwechsel
danach wie ueberall sonst.

Phase 3 - Shanghai 15-20: wie Phase 1.

Game Length (SPEC §26): 1 Run / Best of 3 Runs / Custom Runs / Endless
Practice - wie Bob's 27, teilt sich _run_mode_target() mit dieser
Familie (siehe backend/engine/engine.py).

Nicht mit Tobias abgestimmte eigene Annahme: Treffer/Shanghai-Bonus-
Zaehler laufen PRO RUN (werden bei einem neuen Run zurueckgesetzt,
zusammen mit den Phase-Scores) - nur totalScore/bestRun/runsCompleted
sind match-uebergreifend kumulativ (wie bei Bob's 27). "Persoenlicher
Highscore" aus SPECs Anzeige-Liste ist NICHT umgesetzt - dafuer gibt es
noch kein match-uebergreifendes Highscore-System im Projekt.
"""
from __future__ import annotations

PHASES = ["shanghai1", "doubles", "shanghai2"]

PHASE_TARGETS: dict[str, list] = {
    "shanghai1": list(range(10, 16)),
    "doubles": [f"D{n}" for n in range(1, 21)] + ["BULL"],
    "shanghai2": list(range(15, 21)),
}

PHASE_LABELS = {
    "shanghai1": "Shanghai 10–15",
    "doubles": "Doubles 1–20 + Bull",
    "shanghai2": "Shanghai 15–20",
}


def create_player_state() -> dict:
    return {
        "phaseIndex": 0,
        "targetIndex": 0,
        "phaseScores": {"shanghai1": 0, "doubles": 0, "shanghai2": 0},
        "runScore": 0,
        "totalScore": 0,
        "bestRun": None,
        "totalHits": 0,
        "shanghaiCount": 0,
        "runsCompleted": 0,
    }


def current_phase(state: dict) -> str | None:
    if state["phaseIndex"] >= len(PHASES):
        return None
    return PHASES[state["phaseIndex"]]


def current_target(state: dict):
    phase = current_phase(state)
    if phase is None:
        return None
    return PHASE_TARGETS[phase][state["targetIndex"]]


def _shanghai_visit_result(target_number: int, visit_throws: list[dict]) -> dict:
    total = 0
    mults_hit: set[int] = set()
    hits = 0
    for t in visit_throws:
        if t.get("number") != target_number:
            continue
        mult = t.get("multiplier")
        total += mult * target_number
        mults_hit.add(mult)
        hits += 1
    shanghai = mults_hit == {1, 2, 3}
    if shanghai:
        total += 100
    return {"score": total, "hits": hits, "shanghai": shanghai}


def _double_hit_score(target, segment: dict) -> tuple[int, bool]:
    """(Punkte, war-es-ein-Treffer) fuer EINEN Dart auf EIN Doubles-Ziel."""
    if target == "BULL":
        if segment.get("number") != 25:
            return 0, False
        mult = segment.get("multiplier")
        if mult == 2:
            return 100, True  # Bullseye: 50 + 50 Bonus
        if mult == 1:
            return 50, True  # Single Bull
        return 0, False
    number = int(target[1:])
    if segment.get("number") == number and segment.get("multiplier") == 2:
        return 50, True
    return 0, False


def _simulate_doubles_visit(start_index: int, visit_throws: list[dict]) -> dict:
    """Reine Berechnung (kein Seiteneffekt): jeder Dart der Aufnahme
    geht auf das naechste Doubles-Ziel, IMMER (nicht nur bei Treffer -
    anders als Around the World Required Hits=1)."""
    targets = PHASE_TARGETS["doubles"]
    index = start_index
    score = 0
    hits = 0
    for segment in visit_throws:
        if index >= len(targets):
            break
        pts, hit = _double_hit_score(targets[index], segment)
        score += pts
        hits += 1 if hit else 0
        index += 1
    return {"score": score, "hits": hits, "endingIndex": index}


def apply_throw(player_state: dict, visit_throws: list[dict], settings: dict) -> dict:
    phase = current_phase(player_state)

    if phase == "doubles":
        sim = _simulate_doubles_visit(player_state["targetIndex"], visit_throws)
        outcome = "target_done" if len(visit_throws) >= 3 else "continue"
        return {"outcome": outcome, **sim}

    if phase in ("shanghai1", "shanghai2"):
        if len(visit_throws) < 3:
            return {"outcome": "continue"}
        target = current_target(player_state)
        return {"outcome": "target_done", **_shanghai_visit_result(target, visit_throws)}

    return {"outcome": "continue"}  # Run bereits komplett (wartet auf andere Spieler)


def resolve_visit(player_state: dict, result: dict) -> None:
    """Wird von der Engine GENAU EINMAL nach jeder abgeschlossenen
    Aufnahme aufgerufen."""
    phase = current_phase(player_state)
    if phase is None:
        return

    score = result["score"]
    player_state["phaseScores"][phase] += score
    player_state["runScore"] += score
    player_state["totalHits"] += result["hits"]
    if phase in ("shanghai1", "shanghai2") and result.get("shanghai"):
        player_state["shanghaiCount"] += 1

    if phase == "doubles":
        player_state["targetIndex"] = result["endingIndex"]
    else:
        player_state["targetIndex"] += 1

    if player_state["targetIndex"] >= len(PHASE_TARGETS[phase]):
        player_state["phaseIndex"] += 1
        player_state["targetIndex"] = 0
