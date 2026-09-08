"""
CheckoutRoute: zentrale, spielunabhaengige Checkout-Vorschlaege.
Siehe docs/ARCHITEKTUR.md Abschnitt 4.1.

Kein hartcodiertes Tabellen-Nachschlagen, sondern eine kleine Suche,
die bewusst die kuerzeste Route zuerst versucht und dabei hohe
Segmente vor dem Abschluss bevorzugt - das reproduziert etablierte
Checkout-Charts (z.B. 170 = T20 T20 BULL, 100 = T20 D20) fuer die
ueblichen Faelle, ohne 170 Zeilen Tabelle von Hand zu pflegen.
"""
from __future__ import annotations

_PREFERRED_NON_FINISH = (
    [(f"T{n}", n * 3) for n in range(20, 0, -1)]
    + [("BULL", 50)]
    + [(f"D{n}", n * 2) for n in range(20, 0, -1)]
    + [("S25", 25)]
    + [(f"S{n}", n) for n in range(20, 0, -1)]
)


def _finish_segments(checkout_mode: str) -> list[tuple[str, int]]:
    """Welche Segmente den letzten Dart eines Checkouts bilden duerfen -
    SPEC-Erweiterung 170/121 (mit Tobias abgestimmt, 08.09.2026):
    double_out (nur Doppel/Bullseye), master_out (zusaetzlich Triple),
    straight_out (jeder Dart, auch Single)."""
    if checkout_mode == "double_out":
        return [("BULL", 50)] + [(f"D{n}", n * 2) for n in range(20, 0, -1)]
    if checkout_mode == "master_out":
        return (
            [("BULL", 50)]
            + [(f"D{n}", n * 2) for n in range(20, 0, -1)]
            + [(f"T{n}", n * 3) for n in range(20, 0, -1)]
        )
    return (
        [("BULL", 50)]
        + [(f"T{n}", n * 3) for n in range(20, 0, -1)]
        + [(f"D{n}", n * 2) for n in range(20, 0, -1)]
        + [("S25", 25)]
        + [(f"S{n}", n) for n in range(20, 0, -1)]
    )


def suggest_route(remaining: int, darts_left: int, checkout_mode: str) -> list[str] | None:
    """Empfohlene Dart-Folge fuer den aktuellen Rest, oder None, wenn
    mit den verbleibenden Darts kein Finish moeglich ist. Es werden
    hoechstens 3 Darts betrachtet - mehr braucht eine sinnvolle
    Checkout-Route nie (Maximum ist 170 mit 3 Darts)."""
    if remaining <= 0 or darts_left <= 0:
        return None
    max_darts = min(darts_left, 3)
    for n in range(1, max_darts + 1):
        route = _search_exact(remaining, n, checkout_mode)
        if route is not None:
            return route
    return None


def _search_exact(remaining: int, darts: int, checkout_mode: str) -> list[str] | None:
    """Route mit genau `darts` Wuerfen, oder None."""
    if darts == 1:
        for label, value in _finish_segments(checkout_mode):
            if value == remaining:
                return [label]
        return None
    for label, value in _PREFERRED_NON_FINISH:
        if value >= remaining:
            continue
        rest = _search_exact(remaining - value, darts - 1, checkout_mode)
        if rest is not None:
            return [label] + rest
    return None
