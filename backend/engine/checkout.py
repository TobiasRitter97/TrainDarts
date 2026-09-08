"""
CheckoutRoute: zentrale, spielunabhaengige Checkout-Vorschlaege.
Siehe docs/ARCHITEKTUR.md Abschnitt 4.1.

Korrektur (08.09.2026, mit Tobias abgestimmt): die bisherige reine
Backtracking-Suche bevorzugte immer das hoechstmoegliche Nicht-Finish-
Segment (z.B. T19 statt T15 bei Rest 61) und landete dadurch haeufig
bei mathematisch gueltigen, aber unueblichen Routen (61 -> T19,D2 statt
der etablierten T15,D8). Das laesst sich nicht durch eine einfache
Heuristik reparieren: die etablierte Checkout-Tabelle folgt keiner
sauberen Formel (zwei Reste mit identischen Kandidaten-Doppeln koennen
in der etablierten Tabelle trotzdem unterschiedliche Doppel bevorzugen,
z.B. Rest 63 -> D12 vs. Rest 66 -> D18 bei sonst gleicher Kandidatenlage) -
das ist ein historisch gewachsenes Nachschlagewerk, keine Formel. Fuer
Double Out wird deshalb jetzt DOUBLE_OUT_TABLE verwendet: eine
verifizierte Tabelle fuer 2-170 (Quelle: oeffentlich dokumentierte
Standard-Charts, siehe checkout_table.py-Docstring; alle von Tobias
explizit vorgegebenen Werte sind exakt abgeglichen).

Fuer Master Out (SPEC-Erweiterung, kein etablierter Standard verfuegbar)
gilt: die Double-Out-Tabellenroute ist immer auch eine gueltige Master-
Out-Route (jedes Doppel-Finish ist ebenfalls ein gueltiges Master-Out-
Finish) und wird als sinnvolle Basis wiederverwendet (SPEC-Vorgabe:
"wenn ein gutes klassisches Double verfuegbar ist, darf dieses Primary
bleiben") - zusaetzlich wird geprueft, ob eine KUeRZERE Route ueber ein
Triple-Finish moeglich ist (z.B. Rest 60 -> T20 statt S20,D20), da
Master Out zusaetzliche 1-Dart-Finishes freischaltet. Straight Out
nutzt dieselbe Zusatzsuche mit einem noch groesseren Ziel-Segment-Set
(auch Singles).
"""
from __future__ import annotations

from backend.engine.checkout_table import DOUBLE_OUT_TABLE

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
    straight_out (jeder Dart, auch Single).

    Master-Out-Praeferenz (aus Tobias' eigenen Beispielen hergeleitet,
    Abschnitt 10/28): ein "uebliches" Doppel mit GERADER Segmentnummer
    (D2, D4, ..., D20 - die in der Praxis gebraeuchlichen Doppel) bleibt
    Primary vor einem Triple (z.B. 36 -> D18, nicht T12). Ein "unuebliches"
    Doppel mit UNGERADER Segmentnummer (D1, D3, ..., D19) wird dagegen
    einem direkten Triple NACHGEORDNET (z.B. 30 -> T10, nicht das
    unuebliche D15) und dient nur als letzter Fallback, falls weder ein
    gerades Doppel noch ein Triple den Rest exakt trifft (z.B. 38 -> D19,
    da 38 weder durch 3 teilbar noch ein gerades Doppel ist)."""
    if checkout_mode == "double_out":
        return [("BULL", 50)] + [(f"D{n}", n * 2) for n in range(20, 0, -1)]
    if checkout_mode == "master_out":
        return (
            [("BULL", 50)]
            + [(f"D{n}", n * 2) for n in range(20, 0, -2)]
            + [(f"T{n}", n * 3) for n in range(20, 0, -1)]
            + [(f"D{n}", n * 2) for n in range(19, 0, -2)]
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

    # 1-Dart-Finish ist fuer alle drei Modi eindeutig regelbasiert (kein
    # Tabellen-Nachschlagen noetig) - bei Master Out gewinnt bei einem
    # Gleichstand zwischen Doppel und Triple immer das Doppel, da
    # Doppel in _finish_segments() vor den Triples aufgefuehrt sind
    # (SPEC §10: "ein gutes klassisches Double darf Primary bleiben").
    for label, value in _finish_segments(checkout_mode):
        if value == remaining:
            return [label]
    if max_darts < 2:
        return None

    candidates: list[list[str]] = []
    table_route = DOUBLE_OUT_TABLE.get(remaining)
    if table_route and len(table_route) <= max_darts:
        candidates.append(table_route)

    if checkout_mode != "double_out":
        for n in range(2, max_darts + 1):
            route = _search_exact(remaining, n, checkout_mode)
            if route is not None:
                candidates.append(route)
                break

    if not candidates:
        return None
    return min(candidates, key=len)


def _search_exact(remaining: int, darts: int, checkout_mode: str) -> list[str] | None:
    """Route mit genau `darts` Wuerfen, oder None. Wird nur noch als
    Zusatzsuche fuer Master/Straight Out verwendet (kuerzere Route via
    Triple-Finish als die Double-Out-Tabelle bietet) - fuer Double Out
    selbst wird ausschliesslich DOUBLE_OUT_TABLE verwendet."""
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
