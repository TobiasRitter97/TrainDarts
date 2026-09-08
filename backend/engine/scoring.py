"""
Gemeinsame "auf exakt 0 spielen"-Logik. Sowohl 170 (x01) als auch
Random Checkout sind im Kern ein Countdown mit Bust-Regel - nur der
Startwert unterscheidet sich (fester Wert vs. Zufallsziel).
"""
from __future__ import annotations


def segment_value(segment: dict) -> int:
    return segment.get("number", 0) * segment.get("multiplier", 0)


def is_valid_finisher(segment: dict, checkout_mode: str) -> bool:
    """Darf dieser Dart der letzte (abschliessende) Dart eines Checkouts
    sein? SPEC-Erweiterung 170/121 (mit Tobias abgestimmt, 08.09.2026):
    - double_out: nur Doppel oder Bullseye (Multiplikator 2)
    - master_out: zusaetzlich Triple (Multiplikator 3)
    - straight_out: jeder Dart, auch Single"""
    if checkout_mode == "straight_out":
        return True
    multiplier = segment.get("multiplier")
    if multiplier == 2:
        return True
    return checkout_mode == "master_out" and multiplier == 3


def apply_countdown_throw(start_value: int, visit_throws: list[dict], checkout_mode: str) -> dict:
    """Rechnet die komplette laufende Aufnahme neu ab start_value durch
    (nicht nur den letzten Dart) - dadurch setzt ein Bust automatisch
    auf den Aufnahme-Startwert zurueck, statt nur den busteten Dart zu
    ignorieren, was der echten Darts-Regel entspricht.

    checkout_mode: "double_out" | "master_out" | "straight_out". Bei
    straight_out gibt es kein "Rest 1 ist unerreichbar"-Bust mehr (S1
    kann finishen) - nur Ueberwerfen (Rest < 0) bleibt ein Bust."""
    value = start_value
    for t in visit_throws:
        value -= segment_value(t)
    last = visit_throws[-1]

    requires_finisher_check = checkout_mode != "straight_out"
    bust = (
        value < 0
        or (requires_finisher_check and value == 1)
        or (value == 0 and not is_valid_finisher(last, checkout_mode))
    )
    if bust:
        return {"outcome": "bust", "score": start_value, "dartsUsed": len(visit_throws)}
    if value == 0:
        return {"outcome": "checkout", "score": 0, "dartsUsed": len(visit_throws)}
    return {"outcome": "continue", "score": value, "dartsUsed": len(visit_throws)}
