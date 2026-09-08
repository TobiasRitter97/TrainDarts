"""
GameDefinitions fuer Game Hub & Game Setup (SPEC §9, §29-32,
docs/ARCHITEKTUR.md Abschnitt 4). Nur Metadaten + Settings-Schema fuer
Hub und Setup-Screen. Die eigentliche Spiellogik (Engine-Familien mit
handleThrow etc.) entsteht ab Phase 6/9 gemaess Bau-Reihenfolge in
docs/ARCHITEKTUR.md Abschnitt 12.

170, Bob's 27, Random Checkout, 121, Bob's 27 Easy, Catch 40 Easy,
Catch 40, 60 +/- und Around the World sind aktuell "implemented": True.
Nur JDC Challenge steht noch als "Coming soon"-Card im Hub.
"""
from __future__ import annotations

from backend.games import target_progression as target_progression_family


def bobs27_settings_schema() -> list[dict]:
    """Gemeinsames Settings-Schema fuer die target_progression-Familie
    (Bob's 27, Bob's 27 Easy, SPEC §19/§20) - beide Spiele unterscheiden
    sich nur in der Ziel-Route (siehe backend/games/target_progression.py),
    nicht in den Einstellungen."""
    return [
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
    ]


def catch_settings_schema() -> list[dict]:
    """Gemeinsames Settings-Schema fuer die catch-Familie (Catch 40,
    Catch 40 Easy, SPEC §21/§22). Kein Endless (mit Tobias abgestimmt,
    08.09.2026: das Spiel dauert durch die feste Range schon lang
    genug) - nur ein kompletter Durchgang oder eine kuerzere
    Custom-Anzahl. Die Range selbst (41-81 bzw. 61-100) ist keine
    Einstellung, sondern haengt an der GameDefinition ("catchRange")."""
    return [
        {
            "key": "gameLengthMode",
            "label": "Game Length",
            "type": "select",
            "options": [
                {"value": "full", "label": "Kompletter Durchlauf"},
                {"value": "custom", "label": "Custom"},
            ],
            "default": "full",
        },
        {
            "key": "customTargets", "label": "Anzahl Targets (Custom)", "type": "number",
            "default": 20, "min": 1, "max": 100,
            "showIf": {"key": "gameLengthMode", "equals": "custom"},
        },
        {"key": "shuffle", "label": "Shuffle", "type": "toggle", "default": False},
    ]


def x01_settings_schema() -> list[dict]:
    """Gemeinsames Settings-Schema fuer alle Spiele der x01-Familie
    (SPEC §17). Kuenftige X01-Varianten rufen diese Funktion auf statt
    das Schema zu kopieren - so bleiben Match-Mode-Optionen wie
    "First to X Legs" an einer Stelle gepflegt."""
    return [
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
                {"value": "custom", "label": "First to X Legs"},
                {"value": "endless", "label": "Endless"},
            ],
            "default": "bo3",
        },
        {
            "key": "customLegsToWin",
            "label": "Legs zum Sieg (X)",
            "type": "number",
            "default": 3,
            "min": 1,
            "max": 25,
            "showIf": {"key": "matchMode", "equals": "custom"},
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
    ]


def checkout_range_game_length_field(default: str = "targets_20") -> dict:
    """Gemeinsames "Game Length"-Feld fuer die checkout_range-Familie
    (121, kuenftig Catch 40/Catch 40 Easy/60 +/-)."""
    return {
        "key": "gameLengthMode",
        "label": "Game Length",
        "type": "select",
        "options": [
            {"value": "targets_10", "label": "10 Targets"},
            {"value": "targets_20", "label": "20 Targets"},
            {"value": "targets_30", "label": "30 Targets"},
            {"value": "custom", "label": "Custom"},
            {"value": "endless", "label": "Endless"},
            {"value": "until_max", "label": "Until 170"},
        ],
        "default": default,
    }


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
        "settingsSchema": x01_settings_schema(),
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
        "targets": target_progression_family.BOBS27_TARGETS,
        "settingsSchema": bobs27_settings_schema(),
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
            {"key": "endless", "label": "Endless", "type": "toggle", "default": False},
            {
                "key": "numberOfCheckouts", "label": "Number of Checkouts", "type": "number",
                "default": 20, "min": 1, "max": 200, "presets": [10, 20, 30, 50],
                "showIf": {"key": "endless", "equals": False},
            },
            {
                "key": "dartsPerCheckout",
                "label": "Darts per Checkout",
                "type": "select",
                "options": [
                    {"value": 3, "label": "3"},
                    {"value": 6, "label": "6"},
                    {"value": 9, "label": "9"},
                    {"value": 12, "label": "12"},
                ],
                "default": 6,
            },
        ],
    },
    {
        "id": "121",
        "name": "121",
        "description": "Klassisches 121-Checkout-Training mit Safehouse.",
        "category": "CHECKOUT",
        "icon": "🔢",
        "engineFamily": "checkout_range",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["targets", "until_max", "endless"],
        "settingsSchema": [
            {"key": "startLevel", "label": "Starting Checkout", "type": "number", "default": 121, "min": 2, "max": 170},
            {"key": "maxLevel", "label": "Maximum", "type": "number", "default": 170, "min": 2, "max": 170},
            {
                "key": "safehouseMode",
                "label": "Safehouse",
                "type": "select",
                "options": [
                    {"value": "standard", "label": "Standard"},
                    {"value": "off", "label": "Off"},
                    {"value": "easy", "label": "Easy"},
                ],
                "default": "standard",
            },
            checkout_range_game_length_field(),
            {
                "key": "customTargets", "label": "Anzahl Targets (Custom)", "type": "number",
                "default": 20, "min": 1, "max": 100,
                "showIf": {"key": "gameLengthMode", "equals": "custom"},
            },
            {
                "key": "dartsPerCheckout",
                "label": "Darts per Checkout",
                "type": "select",
                "options": [
                    {"value": 3, "label": "3"},
                    {"value": 6, "label": "6"},
                    {"value": 9, "label": "9"},
                    {"value": 12, "label": "12"},
                ],
                "default": 9,
            },
        ],
    },
    {
        "id": "bobs27_easy",
        "name": "Bob's 27 Easy",
        "description": "Verkürztes Doppel-Training: jedes zweite Doppel, dann Bull.",
        "category": "DOUBLES",
        "icon": "🎯",
        "engineFamily": "target_progression",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["runs", "endless"],
        "targets": target_progression_family.BOBS27_EASY_TARGETS,
        "settingsSchema": bobs27_settings_schema(),
    },
    {
        "id": "catch40_easy",
        "name": "Catch 40 Easy",
        "description": "Catch-Training: 41 bis 81, bis zu 6 Darts pro Zahl.",
        "category": "CHECKOUT",
        "icon": "🎯",
        "engineFamily": "catch",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["targets", "custom"],
        "catchRange": (41, 81),
        "settingsSchema": catch_settings_schema(),
    },
    {
        "id": "catch40",
        "name": "Catch 40",
        "description": "Catch-Training: 61 bis 100, bis zu 6 Darts pro Zahl.",
        "category": "CHECKOUT",
        "icon": "🎯",
        "engineFamily": "catch",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["targets", "custom"],
        "catchRange": (61, 100),
        "settingsSchema": catch_settings_schema(),
    },
    {
        "id": "60plusminus",
        "name": "60 +/-",
        "description": "Start bei 60: +10 bei Checkout, −1 bei Fehlversuch.",
        "category": "CHECKOUT",
        "icon": "📈",
        "engineFamily": "checkout_range",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["rounds", "custom", "endless"],
        # Fest 3 Darts (1 Aufnahme) pro Versuch, SPEC §23 - keine
        # "Darts per Checkout"-Einstellung wie bei 121.
        "dartsPerCheckout": 3,
        "settingsSchema": [
            {"key": "startLevel", "label": "Start Value", "type": "number", "default": 60, "min": 2, "max": 170},
            {
                "key": "onSuccessDelta", "label": "Increase on Checkout", "type": "number",
                "default": 10, "min": 1, "max": 50,
            },
            {
                "key": "onFailDelta", "label": "Decrease on Miss", "type": "number",
                "default": -1, "min": -20, "max": 0,
            },
            {
                "key": "gameLengthMode",
                "label": "Game Length",
                "type": "select",
                "options": [
                    {"value": "targets_10", "label": "10 Rounds"},
                    {"value": "targets_20", "label": "20 Rounds"},
                    {"value": "targets_30", "label": "30 Rounds"},
                    {"value": "custom", "label": "Custom"},
                    {"value": "endless", "label": "Endless"},
                ],
                "default": "targets_20",
            },
            {
                "key": "customTargets", "label": "Anzahl Runden (Custom)", "type": "number",
                "default": 20, "min": 1, "max": 200,
                "showIf": {"key": "gameLengthMode", "equals": "custom"},
            },
        ],
    },
    # -- Bau-Reihenfolge lt. docs/ARCHITEKTUR.md Abschnitt 12, noch nicht implementiert --
    {
        "id": "around_the_world",
        "name": "Around the World",
        "description": "1 bis 20, optional Bull - immer eine Aufnahme pro Zahl.",
        "category": "ACCURACY",
        "icon": "🌍",
        "engineFamily": "accuracy_progression",
        "playerRange": [1, 4],
        "implemented": True,
        "durationModes": ["runs", "custom", "endless"],
        "settingsSchema": [
            {
                "key": "segmentMode",
                "label": "Segment Mode",
                "type": "select",
                "options": [
                    {"value": "single", "label": "Single"},
                    {"value": "double", "label": "Double"},
                    {"value": "triple", "label": "Triple"},
                    {"value": "all", "label": "All"},
                ],
                "default": "single",
            },
            {
                "key": "requiredHits",
                "label": "Required Hits",
                "type": "select",
                "options": [
                    {"value": 1, "label": "1 Treffer"},
                    {"value": 2, "label": "2 Treffer"},
                    {"value": 3, "label": "3 Treffer"},
                ],
                "default": 1,
            },
            {"key": "includeBull", "label": "Include Bull", "type": "toggle", "default": False},
            {
                "key": "mode",
                "label": "Game Length",
                "type": "select",
                "options": [
                    {"value": "single", "label": "1 kompletter Run"},
                    {"value": "bo3", "label": "Best of 3 Runs"},
                    {"value": "custom", "label": "Custom Runs"},
                    {"value": "endless", "label": "Endless"},
                ],
                "default": "single",
            },
            {
                "key": "customRuns", "label": "Anzahl Runs (Custom)", "type": "number",
                "default": 3, "min": 1, "max": 20,
                "showIf": {"key": "mode", "equals": "custom"},
            },
        ],
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
