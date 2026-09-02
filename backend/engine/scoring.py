"""
Gemeinsame "auf exakt 0 spielen"-Logik. Sowohl 170 (x01) als auch
Random Checkout sind im Kern ein Countdown mit Bust-Regel - nur der
Startwert unterscheidet sich (fester Wert vs. Zufallsziel).
"""
from __future__ import annotations


def segment_value(segment: dict) -> int:
    return segment.get("number", 0) * segment.get("multiplier", 0)


def is_double(segment: dict) -> bool:
    return segment.get("multiplier") == 2


def apply_countdown_throw(start_value: int, visit_throws: list[dict], double_out: bool) -> dict:
    """Rechnet die komplette laufende Aufnahme neu ab start_value durch
    (nicht nur den letzten Dart) - dadurch setzt ein Bust automatisch
    auf den Aufnahme-Startwert zurueck, statt nur den busteten Dart zu
    ignorieren, was der echten Darts-Regel entspricht."""
    value = start_value
    for t in visit_throws:
        value -= segment_value(t)
    last = visit_throws[-1]

    bust = (
        value < 0
        or (double_out and value == 1)
        or (value == 0 and double_out and not is_double(last))
    )
    if bust:
        return {"outcome": "bust", "score": start_value, "dartsUsed": len(visit_throws)}
    if value == 0:
        return {"outcome": "checkout", "score": 0, "dartsUsed": len(visit_throws)}
    return {"outcome": "continue", "score": value, "dartsUsed": len(visit_throws)}
