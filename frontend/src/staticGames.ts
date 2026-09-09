// Statische Kopie der Spieledefinitionen vom Backend (GameDefinitions,
// Phase 9 abgeschlossen, 10 Spiele - siehe docs/SPEC.md). Dient NUR als
// Fallback, wenn das Board (Pi) nicht erreichbar ist, damit Game Hub
// und Setup-Screen trotzdem vollstaendig durchsuchbar/anklickbar sind
// (Tobias-Feedback 09.09.2026: komplette Oberflaeche ohne Pi-Verbindung
// ansehen koennen). Tatsaechliches Spielen (Match starten, Wuerfe)
// braucht weiterhin die echte Board-Verbindung. Bei Aenderungen an den
// Spieldefinitionen im Backend muss diese Datei manuell nachgezogen
// werden (per GET /api/games vom laufenden Backend).
import { GameDefinition } from "./api";

export const STATIC_GAMES = [
  {
    "id": "170",
    "name": "170",
    "description": "Kompakte X01-Trainingsvariante: von 170 auf exakt 0.",
    "category": "CHECKOUT",
    "icon": "🎯",
    "engineFamily": "x01",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "legs",
      "sets",
      "endless"
    ],
    "settingsSchema": [
      {
        "key": "checkoutMode",
        "label": "Checkout",
        "type": "select",
        "options": [
          {
            "value": "double_out",
            "label": "Double Out"
          },
          {
            "value": "master_out",
            "label": "Master Out"
          },
          {
            "value": "straight_out",
            "label": "Straight Out"
          }
        ],
        "default": "double_out"
      },
      {
        "key": "matchMode",
        "label": "Match Mode",
        "type": "select",
        "options": [
          {
            "value": "1_leg",
            "label": "1 Leg"
          },
          {
            "value": "bo3",
            "label": "Best of 3 Legs"
          },
          {
            "value": "bo5",
            "label": "Best of 5 Legs"
          },
          {
            "value": "bo7",
            "label": "Best of 7 Legs"
          },
          {
            "value": "custom",
            "label": "First to X Legs"
          },
          {
            "value": "endless",
            "label": "Endless"
          }
        ],
        "default": "bo3"
      },
      {
        "key": "customLegsToWin",
        "label": "Legs zum Sieg (X)",
        "type": "number",
        "default": 3,
        "min": 1,
        "max": 25,
        "showIf": {
          "key": "matchMode",
          "equals": "custom"
        }
      },
      {
        "key": "setsEnabled",
        "label": "Sets aktivieren",
        "type": "toggle",
        "default": false
      },
      {
        "key": "legsPerSet",
        "label": "Legs pro Set",
        "type": "number",
        "default": 3,
        "min": 1,
        "max": 9,
        "showIf": {
          "key": "setsEnabled",
          "equals": true
        }
      },
      {
        "key": "setsToWin",
        "label": "Sets zum Sieg",
        "type": "number",
        "default": 2,
        "min": 1,
        "max": 9,
        "showIf": {
          "key": "setsEnabled",
          "equals": true
        }
      }
    ]
  },
  {
    "id": "bobs27",
    "name": "Bob's 27",
    "description": "Doppel-Training: D1 bis D20, dann Bull.",
    "category": "DOUBLES",
    "icon": "🎯",
    "engineFamily": "target_progression",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "runs",
      "endless"
    ],
    "targets": [
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
      "D9",
      "D10",
      "D11",
      "D12",
      "D13",
      "D14",
      "D15",
      "D16",
      "D17",
      "D18",
      "D19",
      "D20",
      "BULL"
    ],
    "settingsSchema": [
      {
        "key": "mode",
        "label": "Mode",
        "type": "select",
        "options": [
          {
            "value": "single",
            "label": "Single Run"
          },
          {
            "value": "bo3",
            "label": "Best of 3 Runs"
          },
          {
            "value": "bo5",
            "label": "Best of 5 Runs"
          },
          {
            "value": "endless",
            "label": "Endless"
          }
        ],
        "default": "single"
      }
    ]
  },
  {
    "id": "random_checkout",
    "name": "Random Checkout",
    "description": "Zufälliger Checkout pro Aufgabe, für alle Spieler gleich.",
    "category": "CHECKOUT",
    "icon": "🎲",
    "engineFamily": "random_checkout",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "count",
      "endless"
    ],
    "settingsSchema": [
      {
        "key": "minCheckout",
        "label": "Minimum Checkout",
        "type": "number",
        "default": 40,
        "min": 2,
        "max": 170
      },
      {
        "key": "maxCheckout",
        "label": "Maximum Checkout",
        "type": "number",
        "default": 120,
        "min": 2,
        "max": 170
      },
      {
        "key": "endless",
        "label": "Endless",
        "type": "toggle",
        "default": false
      },
      {
        "key": "numberOfCheckouts",
        "label": "Number of Checkouts",
        "type": "number",
        "default": 20,
        "min": 1,
        "max": 200,
        "presets": [
          10,
          20,
          30,
          50
        ],
        "showIf": {
          "key": "endless",
          "equals": false
        }
      },
      {
        "key": "dartsPerCheckout",
        "label": "Darts per Checkout",
        "type": "select",
        "options": [
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 6,
            "label": "6"
          },
          {
            "value": 9,
            "label": "9"
          },
          {
            "value": 12,
            "label": "12"
          }
        ],
        "default": 6
      }
    ]
  },
  {
    "id": "121",
    "name": "121",
    "description": "Klassisches 121-Checkout-Training mit Safehouse.",
    "category": "CHECKOUT",
    "icon": "🔢",
    "engineFamily": "checkout_range",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "targets",
      "until_max",
      "endless"
    ],
    "settingsSchema": [
      {
        "key": "startLevel",
        "label": "Starting Checkout",
        "type": "number",
        "default": 121,
        "min": 2,
        "max": 170
      },
      {
        "key": "maxLevel",
        "label": "Maximum",
        "type": "number",
        "default": 170,
        "min": 2,
        "max": 170
      },
      {
        "key": "safehouseMode",
        "label": "Safehouse",
        "type": "select",
        "options": [
          {
            "value": "standard",
            "label": "Standard"
          },
          {
            "value": "off",
            "label": "Off"
          },
          {
            "value": "easy",
            "label": "Easy"
          }
        ],
        "default": "standard"
      },
      {
        "key": "checkoutMode",
        "label": "Checkout",
        "type": "select",
        "options": [
          {
            "value": "double_out",
            "label": "Double Out"
          },
          {
            "value": "master_out",
            "label": "Master Out"
          },
          {
            "value": "straight_out",
            "label": "Straight Out"
          }
        ],
        "default": "double_out"
      },
      {
        "key": "gameLengthMode",
        "label": "Game Length",
        "type": "select",
        "options": [
          {
            "value": "targets_10",
            "label": "10 Targets"
          },
          {
            "value": "targets_20",
            "label": "20 Targets"
          },
          {
            "value": "targets_30",
            "label": "30 Targets"
          },
          {
            "value": "custom",
            "label": "Custom"
          },
          {
            "value": "endless",
            "label": "Endless"
          },
          {
            "value": "until_max",
            "label": "Until 170"
          }
        ],
        "default": "targets_20"
      },
      {
        "key": "customTargets",
        "label": "Anzahl Targets (Custom)",
        "type": "number",
        "default": 20,
        "min": 1,
        "max": 100,
        "showIf": {
          "key": "gameLengthMode",
          "equals": "custom"
        }
      },
      {
        "key": "dartsPerCheckout",
        "label": "Darts per Checkout",
        "type": "select",
        "options": [
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 6,
            "label": "6"
          },
          {
            "value": 9,
            "label": "9"
          },
          {
            "value": 12,
            "label": "12"
          }
        ],
        "default": 9
      }
    ]
  },
  {
    "id": "bobs27_easy",
    "name": "Bob's 27 Easy",
    "description": "Verkürztes Doppel-Training: jedes zweite Doppel, dann Bull.",
    "category": "DOUBLES",
    "icon": "🎯",
    "engineFamily": "target_progression",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "runs",
      "endless"
    ],
    "targets": [
      "D2",
      "D4",
      "D6",
      "D8",
      "D10",
      "D12",
      "D14",
      "D16",
      "D18",
      "D20",
      "BULL"
    ],
    "settingsSchema": [
      {
        "key": "mode",
        "label": "Mode",
        "type": "select",
        "options": [
          {
            "value": "single",
            "label": "Single Run"
          },
          {
            "value": "bo3",
            "label": "Best of 3 Runs"
          },
          {
            "value": "bo5",
            "label": "Best of 5 Runs"
          },
          {
            "value": "endless",
            "label": "Endless"
          }
        ],
        "default": "single"
      }
    ]
  },
  {
    "id": "catch40_easy",
    "name": "Catch 40 Easy",
    "description": "Catch-Training: 41 bis 81, bis zu 6 Darts pro Zahl.",
    "category": "CHECKOUT",
    "icon": "🎯",
    "engineFamily": "catch",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "targets",
      "custom"
    ],
    "catchRange": [
      41,
      81
    ],
    "settingsSchema": [
      {
        "key": "gameLengthMode",
        "label": "Game Length",
        "type": "select",
        "options": [
          {
            "value": "full",
            "label": "Kompletter Durchlauf"
          },
          {
            "value": "custom",
            "label": "Custom"
          }
        ],
        "default": "full"
      },
      {
        "key": "customTargets",
        "label": "Anzahl Targets (Custom)",
        "type": "number",
        "default": 20,
        "min": 1,
        "max": 100,
        "showIf": {
          "key": "gameLengthMode",
          "equals": "custom"
        }
      },
      {
        "key": "shuffle",
        "label": "Shuffle",
        "type": "toggle",
        "default": false
      }
    ]
  },
  {
    "id": "catch40",
    "name": "Catch 40",
    "description": "Catch-Training: 61 bis 100, bis zu 6 Darts pro Zahl.",
    "category": "CHECKOUT",
    "icon": "🎯",
    "engineFamily": "catch",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "targets",
      "custom"
    ],
    "catchRange": [
      61,
      100
    ],
    "settingsSchema": [
      {
        "key": "gameLengthMode",
        "label": "Game Length",
        "type": "select",
        "options": [
          {
            "value": "full",
            "label": "Kompletter Durchlauf"
          },
          {
            "value": "custom",
            "label": "Custom"
          }
        ],
        "default": "full"
      },
      {
        "key": "customTargets",
        "label": "Anzahl Targets (Custom)",
        "type": "number",
        "default": 20,
        "min": 1,
        "max": 100,
        "showIf": {
          "key": "gameLengthMode",
          "equals": "custom"
        }
      },
      {
        "key": "shuffle",
        "label": "Shuffle",
        "type": "toggle",
        "default": false
      }
    ]
  },
  {
    "id": "60plusminus",
    "name": "60 +/-",
    "description": "Start bei 60: +10 bei Checkout, −1 bei Fehlversuch.",
    "category": "CHECKOUT",
    "icon": "📈",
    "engineFamily": "checkout_range",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "rounds",
      "custom",
      "endless"
    ],
    "dartsPerCheckout": 3,
    "settingsSchema": [
      {
        "key": "startLevel",
        "label": "Start Value",
        "type": "number",
        "default": 60,
        "min": 2,
        "max": 170
      },
      {
        "key": "onSuccessDelta",
        "label": "Increase on Checkout",
        "type": "number",
        "default": 10,
        "min": 1,
        "max": 50
      },
      {
        "key": "onFailDelta",
        "label": "Decrease on Miss",
        "type": "number",
        "default": -1,
        "min": -20,
        "max": 0
      },
      {
        "key": "gameLengthMode",
        "label": "Game Length",
        "type": "select",
        "options": [
          {
            "value": "targets_10",
            "label": "10 Rounds"
          },
          {
            "value": "targets_20",
            "label": "20 Rounds"
          },
          {
            "value": "targets_30",
            "label": "30 Rounds"
          },
          {
            "value": "custom",
            "label": "Custom"
          },
          {
            "value": "endless",
            "label": "Endless"
          }
        ],
        "default": "targets_20"
      },
      {
        "key": "customTargets",
        "label": "Anzahl Runden (Custom)",
        "type": "number",
        "default": 20,
        "min": 1,
        "max": 200,
        "showIf": {
          "key": "gameLengthMode",
          "equals": "custom"
        }
      }
    ]
  },
  {
    "id": "around_the_world",
    "name": "Around the World",
    "description": "Eigene Zahlenliste je Spieler (1-20, optional Bull) - wer zuerst fertig ist, gewinnt.",
    "category": "ACCURACY",
    "icon": "🌍",
    "engineFamily": "accuracy_progression",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "race"
    ],
    "settingsSchema": [
      {
        "key": "segmentMode",
        "label": "Segment Mode",
        "type": "select",
        "options": [
          {
            "value": "single",
            "label": "Single"
          },
          {
            "value": "double",
            "label": "Double"
          },
          {
            "value": "triple",
            "label": "Triple"
          },
          {
            "value": "all",
            "label": "All"
          }
        ],
        "default": "single"
      },
      {
        "key": "requiredHits",
        "label": "Required Hits",
        "type": "select",
        "options": [
          {
            "value": 1,
            "label": "1 Treffer"
          },
          {
            "value": 2,
            "label": "2 Treffer"
          },
          {
            "value": 3,
            "label": "3 Treffer"
          }
        ],
        "default": 1
      },
      {
        "key": "includeBull",
        "label": "Include Bull",
        "type": "toggle",
        "default": false
      }
    ]
  },
  {
    "id": "jdc",
    "name": "JDC Challenge",
    "description": "Shanghai 10-15 – Doubles 1-20+Bull – Shanghai 15-20 (etablierte JDC-Regeln).",
    "category": "ACCURACY",
    "icon": "🏆",
    "engineFamily": "jdc",
    "playerRange": [
      1,
      4
    ],
    "implemented": true,
    "durationModes": [
      "runs",
      "custom",
      "endless"
    ],
    "settingsSchema": [
      {
        "key": "mode",
        "label": "Game Length",
        "type": "select",
        "options": [
          {
            "value": "single",
            "label": "1 Run"
          },
          {
            "value": "bo3",
            "label": "Best of 3 Runs"
          },
          {
            "value": "custom",
            "label": "Custom Runs"
          },
          {
            "value": "endless",
            "label": "Endless Practice"
          }
        ],
        "default": "single"
      },
      {
        "key": "customRuns",
        "label": "Anzahl Runs (Custom)",
        "type": "number",
        "default": 3,
        "min": 1,
        "max": 20,
        "showIf": {
          "key": "mode",
          "equals": "custom"
        }
      }
    ]
  }
] as unknown as GameDefinition[];
