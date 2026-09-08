"""
Automatisierte Tests fuer die CheckoutRoute-Engine (backend/engine/
checkout.py), insbesondere fuer die Checkout-Regel-Erweiterung
(Double Out / Master Out / Straight Out, 08.09.2026).

Bewusst mit dem eingebauten unittest-Modul statt pytest (SPEC-Vorgabe
"keine unnoetigen Dependencies", CLAUDE.md) - laeuft ohne zusaetzliche
Installation via:

    ./.venv/bin/python3 -m unittest backend.tests.test_checkout -v

Deckt SPEC-Erweiterung Abschnitt 28/29 ab: direkte Triple-/Double-/
Bull-Outs bei Master Out, ungueltige Single-Outs, Vergleichstests
Double Out vs. Master Out mit unterschiedlichen Ergebnissen fuer
denselben Rest, sowie die komplette von Tobias vorgegebene
Double-Out-Referenztabelle (Abschnitt 23/24).
"""
from __future__ import annotations

import unittest

from backend.engine.checkout import suggest_route
from backend.engine.checkout_table import DOUBLE_OUT_TABLE
from backend.engine.scoring import apply_countdown_throw, is_valid_finisher

BOGEY_NUMBERS = (159, 162, 163, 165, 166, 168, 169)


def _seg(label: str) -> dict:
    label = label.upper()
    if label == "BULL":
        return {"number": 25, "multiplier": 2}
    if label == "SBULL":
        return {"number": 25, "multiplier": 1}
    prefix, number = label[0], int(label[1:])
    multiplier = {"S": 1, "D": 2, "T": 3}[prefix]
    return {"number": number, "multiplier": multiplier}


def _route_value(route: list[str]) -> int:
    total = 0
    for label in route:
        seg = _seg(label)
        total += seg["number"] * seg["multiplier"]
    return total


class DoubleOutReferenceTableTest(unittest.TestCase):
    """Jeder von Tobias in der Aufgabenstellung explizit vorgegebene
    Double-Out-Wert (Abschnitt 23/24), gegen die echte suggest_route()
    geprueft - nicht nur gegen die rohe Tabelle, damit auch die
    darts_left-Logik (kuerzeste Route zuerst) mitgetestet wird."""

    TWO_DART_EXAMPLES = {
        61: "T15,D8", 62: "T10,D16", 63: "T13,D12", 64: "T16,D8", 65: "T19,D4",
        66: "T10,D18", 67: "T17,D8", 68: "T20,D4", 69: "T19,D6", 70: "T18,D8",
        81: "T19,D12", 82: "T14,D20", 83: "T17,D16", 84: "T20,D12", 85: "T15,D20",
        86: "T18,D16", 87: "T17,D18", 88: "T16,D20", 89: "T19,D16", 90: "T18,D18",
        91: "T17,D20", 92: "T20,D16", 93: "T19,D18", 94: "T18,D20", 95: "T19,D19",
        96: "T20,D18", 97: "T19,D20", 98: "T20,D19", 100: "T20,D20",
        101: "T17,BULL", 104: "T18,BULL", 107: "T19,BULL", 110: "T20,BULL",
    }

    THREE_DART_EXAMPLES = {
        170: "T20,T20,BULL", 167: "T20,T19,BULL", 164: "T20,T18,BULL",
        161: "T20,T17,BULL", 160: "T20,T20,D20", 121: "T20,T11,D14",
    }

    def test_two_dart_examples_with_three_darts_available(self):
        for remaining, expected in self.TWO_DART_EXAMPLES.items():
            with self.subTest(remaining=remaining):
                route = suggest_route(remaining, 3, "double_out")
                self.assertEqual(",".join(route), expected)

    def test_two_dart_examples_with_exactly_two_darts(self):
        # Mit nur 2 verbleibenden Darts muss dieselbe (bereits kuerzeste)
        # Route herauskommen wie mit 3 verfuegbaren Darts.
        for remaining, expected in self.TWO_DART_EXAMPLES.items():
            with self.subTest(remaining=remaining):
                route = suggest_route(remaining, 2, "double_out")
                self.assertEqual(",".join(route), expected)

    def test_three_dart_examples(self):
        for remaining, expected in self.THREE_DART_EXAMPLES.items():
            with self.subTest(remaining=remaining):
                route = suggest_route(remaining, 3, "double_out")
                self.assertEqual(",".join(route), expected)

    def test_121_needs_three_darts_no_checkout_with_two(self):
        self.assertIsNone(suggest_route(121, 2, "double_out"))

    def test_bogey_numbers_have_no_checkout(self):
        for n in BOGEY_NUMBERS:
            with self.subTest(n=n):
                self.assertIsNone(suggest_route(n, 3, "double_out"))
                self.assertNotIn(n, DOUBLE_OUT_TABLE)

    def test_table_routes_are_internally_consistent(self):
        """Jede Tabellen-Route: Summe ergibt den Rest, letzter Dart ist
        ein gueltiges Double-Out-Finish, hoechstens 3 Darts."""
        for remaining, route in DOUBLE_OUT_TABLE.items():
            with self.subTest(remaining=remaining):
                self.assertLessEqual(len(route), 3)
                self.assertEqual(_route_value(route), remaining)
                last = _seg(route[-1])
                self.assertTrue(is_valid_finisher(last, "double_out"))


class MasterOutDirectFinishTest(unittest.TestCase):
    """SPEC-Erweiterung Abschnitt 28: direkte Triple-/Double-/Bull-Outs."""

    def test_direct_triple_outs(self):
        cases = {60: "T20", 57: "T19", 54: "T18", 51: "T17", 45: "T15", 30: "T10", 3: "T1"}
        for remaining, expected in cases.items():
            with self.subTest(remaining=remaining):
                self.assertEqual(suggest_route(remaining, 1, "master_out"), [expected])

    def test_direct_doubles_preferred_over_alternative_triple(self):
        # 40, 32, 36, 24 sind nur ueber ein (uebliches, gerades) Doppel
        # in einem Dart erreichbar bzw. das Doppel wird bevorzugt.
        cases = {40: "D20", 32: "D16", 36: "D18", 24: "D12"}
        for remaining, expected in cases.items():
            with self.subTest(remaining=remaining):
                self.assertEqual(suggest_route(remaining, 1, "master_out"), [expected])

    def test_bull(self):
        self.assertEqual(suggest_route(50, 1, "master_out"), ["BULL"])

    def test_invalid_single_out_20_rest(self):
        # 20 Rest darf bei Master Out NICHT ueber Single 20 beendet
        # werden - die Engine muss stattdessen das gueltige Doppel
        # vorschlagen bzw. beim Werfen von S20 als Bust werten.
        route = suggest_route(20, 1, "master_out")
        self.assertEqual(route, ["D10"])
        result = apply_countdown_throw(20, [_seg("S20")], "master_out")
        self.assertEqual(result["outcome"], "bust")

    def test_single_never_finishes_under_master_out(self):
        # 20 Rest, Wurf S20 (Rest 0, aber Single) -> Bust; D10 -> gueltig.
        bust_result = apply_countdown_throw(20, [_seg("S1"), _seg("S1"), _seg("S18")], "master_out")
        self.assertEqual(bust_result["outcome"], "bust")
        ok_result = apply_countdown_throw(20, [_seg("D10")], "master_out")
        self.assertEqual(ok_result["outcome"], "checkout")


class DoubleOutVsMasterOutComparisonTest(unittest.TestCase):
    """SPEC-Erweiterung Abschnitt 29: derselbe Rest liefert je nach
    Checkout Mode unterschiedliche Ergebnisse."""

    def test_60_one_dart(self):
        self.assertIsNone(suggest_route(60, 1, "double_out"))
        self.assertEqual(suggest_route(60, 1, "master_out"), ["T20"])

    def test_57_one_dart(self):
        self.assertIsNone(suggest_route(57, 1, "double_out"))
        self.assertEqual(suggest_route(57, 1, "master_out"), ["T19"])

    def test_40_one_dart_identical_in_both_modes(self):
        self.assertEqual(suggest_route(40, 1, "double_out"), ["D20"])
        self.assertEqual(suggest_route(40, 1, "master_out"), ["D20"])

    def test_master_out_prefers_shortest_route_over_double_out_route(self):
        # 60 mit 3 Darts: Master Out darf NICHT die 2-Dart-Double-Out-
        # Route (S20,D20) uebernehmen, wenn ein 1-Dart-Finish existiert.
        route = suggest_route(60, 3, "master_out")
        self.assertEqual(route, ["T20"])

    def test_81_two_darts_no_shorter_master_out_route_exists(self):
        # 81 ist unter beiden Modi nicht in 1 Dart erreichbar - die
        # etablierte Double-Out-Route bleibt hier sinnvoll auch fuer
        # Master Out (SPEC Abschnitt 10: "ein gutes Double darf Primary
        # bleiben").
        self.assertEqual(suggest_route(81, 2, "double_out"), ["T19", "D12"])
        self.assertEqual(suggest_route(81, 2, "master_out"), ["T19", "D12"])


class BustRulesTest(unittest.TestCase):
    """SPEC-Erweiterung Abschnitt 19/20: Bust-Regeln je Checkout Mode."""

    def test_double_out_rest_one_is_bust(self):
        result = apply_countdown_throw(31, [_seg("T10")], "double_out")
        self.assertEqual(result["outcome"], "bust")

    def test_master_out_rest_one_is_still_bust(self):
        result = apply_countdown_throw(31, [_seg("T10")], "master_out")
        self.assertEqual(result["outcome"], "bust")

    def test_master_out_rest_two_is_not_bust_but_restricted(self):
        # Rest 2 nach einem Dart ist bei Master Out kein Bust (D1 bleibt
        # moeglich), obwohl kein Triple 2 treffen kann.
        result = apply_countdown_throw(62, [_seg("T20")], "master_out")
        self.assertEqual(result["outcome"], "continue")
        self.assertEqual(result["score"], 2)

    def test_overthrow_is_always_bust(self):
        for mode in ("double_out", "master_out", "straight_out"):
            with self.subTest(mode=mode):
                result = apply_countdown_throw(10, [_seg("T20")], mode)
                self.assertEqual(result["outcome"], "bust")

    def test_straight_out_no_rest_one_bust(self):
        result = apply_countdown_throw(31, [_seg("T10")], "straight_out")
        self.assertEqual(result["outcome"], "continue")
        self.assertEqual(result["score"], 1)


if __name__ == "__main__":
    unittest.main()
