"""
GameDefinitions fuer Game Hub & Game Setup (SPEC §9, §29-32,
docs/ARCHITEKTUR.md Abschnitt 4). Nur Metadaten + Settings-Schema fuer
Hub und Setup-Screen. Die eigentliche Spiellogik (Engine-Familien mit
handleThrow etc.) entsteht ab Phase 6/9 gemaess Bau-Reihenfolge in
docs/ARCHITEKTUR.md Abschnitt 12.

Nur 170, Bob's 27 und Random Checkout sind aktuell "implemented": True
(Phase 9 Referenzspiele). Die restlichen sieben stehen als
"Coming soon"-Cards im Hub.
"""
from __future__ import annotations

GAMES: list[dict] = [
    {
        "id": "170",
        "name": "170",
        "description": "Kompakte X01-Trainingsvariante: von 170 auf exakt 0.",
        "category": "CHECKOUT",
        "icon": "🎯",
        "engineFamily": "x01",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["legs", "sets", "endless"],
        "settingsSchema": [
            {"key": "doubleOut", "label": "Double Out", "type": "toggle", "default": True},
            {
                "key": "matchMode",
                "label": "Match Mode",
                "type": "select",
                "options": [
                    {"value": "1_leg", "label": "1 Leg"},
                    {"value": "bo3", "label": "Best of 3 Legs"},
                    {"value": "bo5", "label": "Best of 5 Legs"},
                    {"value": "bo7", "label": "Best of 7 Legs"},
                    {"value": "endless", "label": "Endless"},
                ],
                "default": "bo3",
            },
            {"key": "setsEnabled", "label": "Sets aktivieren", "type": "toggle", "default": False},
            {
                "key": "legsPerSet",
                "label": "Legs pro Set",
                "type": "number",
                "default": 3,
                "min": 1,
                "max": 9,
                "showIf": {"key": "setsEnabled", "equals": True},
            },
            {
                "key": "setsToWin",
                "label": "Sets zum Sieg",
                "type": "number",
                "default": 2,
                "min": 1,
                "max": 9,
                "showIf": {"key": "setsEnabled", "equals": True},
            },
        ],
    },
    {
        "id": "bobs27",
        "name": "Bob's 27",
        "description": "Doppel-Training: D1 bis D20, dann Bull.",
        "category": "DOUBLES",
        "icon": "🎯",
        "engineFamily": "target_progression",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["runs", "endless"],
        "settingsSchema": [
            {
                "key": "mode",
                "label": "Mode",
                "type": "select",
                "options": [
                    {"value": "single", "label": "Single Run"},
                    {"value": "bo3", "label": "Best of 3 Runs"},
                    {"value": "bo5", "label": "Best of 5 Runs"},
                    {"value": "endless", "label": "Endless"},
                ],
                "default": "single",
            },
        ],
    },
    {
        "id": "random_checkout",
        "name": "Random Checkout",
        "description": "Zufälliger Checkout pro Aufgabe, für alle Spieler gleich.",
        "category": "CHECKOUT",
        "icon": "🎲",
        "engineFamily": "random_checkout",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["count", "endless"],
        "settingsSchema": [
            {
                "key": "minCheckout", "label": "Minimum Checkout", "type": "number",
                "default": 40, "min": 2, "max": 170,
            },
            {
                "key": "maxCheckout", "label": "Maximum Checkout", "type": "number",
                "default": 120, "min": 2, "max": 170,
            },
            {
                "key": "dartsPerCheckout", "label": "Darts per Checkout", "type": "number",
                "default": 9, "min": 1, "max": 15, "presets": [3, 6, 9, 12],
            },
            {"key": "endless", "label": "Endless", "type": "toggle", "default": False},
            {
                "key": "numberOfCheckouts", "label": "Number of Checkouts", "type": "number",
                "default": 20, "min": 1, "max": 200, "presets": [10, 20, 30, 50],
                "showIf": {"key": "endless", "equals": False},
            },
        ],
    },
    # -- Bau-Reihenfolge lt. docs/ARCHITEKTUR.md Abschnitt 12, noch nicht implementiert --
    {
        "id": "121", "name": "121", "description": "Klassisches 121-Checkout-Training.",
        "category": "CHECKOUT", "icon": "🔢", "engineFamily": "checkout_range",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
    {
        "id": "bobs27_easy", "name": "Bob's 27 Easy", "description": "Verkürzte Bob's-27-Route.",
        "category": "DOUBLES", "icon": "🎯", "engineFamily": "target_progression",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
    {
        "id": "catch40_easy", "name": "Catch 40 Easy", "description": "Catch-Training, Checkout 41–81.",
        "category": "CHECKOUT", "icon": "🎯", "engineFamily": "checkout_range",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
    {
        "id": "catch40", "name": "Catch 40", "description": "Catch-Training, Checkout 61–100.",
        "category": "CHECKOUT", "icon": "🎯", "engineFamily": "checkout_range",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
    {
        "id": "60plusminus", "name": "60 +/-", "description": "+10 bei Erfolg, −1 bei Fehlversuch.",
        "category": "CHECKOUT", "icon": "📈", "engineFamily": "checkout_range",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
    {
        "id": "around_the_world", "name": "Around the World", "description": "1 bis 20, optional Bull.",
        "category": "ACCURACY", "icon": "🌍", "engineFamily": "target_progression",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
    {
        "id": "jdc", "name": "JDC Challenge", "description": "Shanghai – Doubles – Shanghai.",
        "category": "ACCURACY", "icon": "🏆", "engineFamily": "jdc",
        "playerRange": [1, 4], "implemented": False, "durationModes": [], "settingsSchema": [],
    },
]


def list_games() -> list[dict]:
    return GAMES


def get_game(game_id: str) -> dict | None:
    for g in GAMES:
        if g["id"] == game_id:
            return g
    return None
