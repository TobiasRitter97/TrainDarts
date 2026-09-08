"""
Profil-Statistiken & Highscores (SPEC §5, §34, §35).

Konsequente Fortsetzung des bestehenden Event-Sourcing-Prinzips
(docs/ARCHITEKTUR.md: "State ist immer Replay des Logs"): Statistiken
werden NICHT bei jedem Matchende inkrementell fortgeschrieben (das
waere bei spaeterem Undo/Korrektur eines bereits abgeschlossenen
Matches fehleranfaellig - Doppelzaehlung oder veraltete Werte), sondern
bei jeder Anfrage frisch aus den bereits gespeicherten, abgeschlossenen
Matches berechnet (Replay ueber MatchEngine, dieselbe Quelle wie beim
Fortsetzen eines unterbrochenen Matches). Das ist fuer eine lokale
Trainings-App mit ueberschaubarer Match-Anzahl performant genug und
vermeidet einen kompletten zweiten (Cache-Invalidierungs-)Zustand.

Die vorbereiteten Tabellen `highscores`/`stats_summary` aus dem
urspruenglichen Schema (backend/persistence/db.py) werden deshalb
bewusst NICHT beschrieben - sie blieben ungenutzt, seit sie angelegt
wurden (config_hash war z.B. bislang immer ein leerer String). Diese
Datei berechnet stattdessen alles bei Bedarf direkt aus
matches/match_players/match_events + config_hash (der hier erstmals
tatsaechlich befuellt wird, siehe compute_config_hash()).

gameConfigurationHash (SPEC §34): Hash ueber Spiel-ID + volle
Settings - bewusst ALLE Settings, nicht nur "relevante" (das muesste
pro Spiel einzeln entschieden werden und wuerde stillschweigend
Ergebnisse zusammenlegen, die laut SPEC-Beispiel getrennt bleiben
muessen, z.B. Random Checkout 40-80/6 Darts vs. 80-130/3 Darts).
"""
from __future__ import annotations

import hashlib
import json

from backend.config.games import get_game
from backend.persistence.db import get_connection

# Pro Engine-Familie die EINE Kennzahl, die als "persoenliche
# Bestleistung"/Highscore-Metrik zaehlt (SPEC §34 Beispiel: Bob's 27
# ALL-TIME nach Punktzahl). Muss ein Feld aus dem jeweiligen
# player_state sein (siehe backend/engine/*.py create_player_state).
PRIMARY_METRIC = {
    "x01": "highestCheckout",
    "checkout_range": "highestLevel",
    "catch": "highestLevel",
    "random_checkout": "successfulCheckouts",
    "target_progression": "bestRun",
    "accuracy_progression": "successfulTargets",
    "jdc": "totalScore",
}

# Nur diese Familien haben ein "Checkout" im klassischen Sinn (SPEC
# §35: Checkout %, Average Checkout Darts, Highest Checkout, Scoring
# Average) - Aufnahmen aus anderen Familien (z.B. Around the World)
# wuerden diese Kennzahlen sonst verwaessern.
CHECKOUT_FAMILIES = {"x01", "checkout_range", "catch", "random_checkout"}


def compute_config_hash(game_id: str, settings: dict) -> str:
    canonical = json.dumps({"gameId": game_id, "settings": settings}, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()[:12]


def _pct(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


def _load_finished_matches(profile_id: str | None = None, game_id: str | None = None) -> list[dict]:
    conn = get_connection()
    query = (
        "SELECT DISTINCT m.id, m.game_id, m.config_json, m.config_hash, "
        "m.finished_at, m.winner_profile_id FROM matches m"
    )
    conditions = ["m.status = 'finished'"]
    params: list[str] = []
    if profile_id is not None:
        query += " JOIN match_players mp ON mp.match_id = m.id"
        conditions.append("mp.profile_id = ?")
        params.append(profile_id)
    if game_id is not None:
        conditions.append("m.game_id = ?")
        params.append(game_id)
    query += " WHERE " + " AND ".join(conditions) + " ORDER BY m.finished_at ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _replay_match(row: dict):
    from backend.engine.engine import MatchEngine  # spaeter Import: Zyklus vermeiden
    from backend.persistence import matches as matches_db

    game = get_game(row["game_id"])
    if game is None:
        return None
    events = matches_db.load_match_events(row["id"])
    player_ids = matches_db.load_match_player_ids(row["id"])
    players = [{"id": pid, "name": pid} for pid in player_ids]
    try:
        return MatchEngine(row["id"], game, players, json.loads(row["config_json"]), events=events)
    except Exception:
        # Ein einzelnes beschaedigtes/inkompatibles altes Match soll
        # nicht die gesamte Statistik-Abfrage zum Absturz bringen.
        return None


def compute_profile_stats(profile_id: str) -> dict:
    """SPEC §35: langfristige Statistiken ueber alle Spiele hinweg,
    plus Bestleistung je Spiel und eine kompakte Trainingshistorie."""
    rows = _load_finished_matches(profile_id=profile_id)

    games_played = 0
    wins = 0
    total_darts = singles = doubles = triples = bulls = misses = 0
    scoring_points = scoring_visits = 0
    checkouts_completed = checkout_darts_total = highest_checkout = 0
    per_game: dict[str, dict] = {}
    history: list[dict] = []

    for row in rows:
        engine = _replay_match(row)
        if engine is None or profile_id not in engine.player_states:
            continue
        state = engine.player_states[profile_id]
        # Bei Solo-Training ist der einzige Spieler technisch immer
        # "Gewinner" (Engine-Logik fuer den Run-/Match-Abschluss) - das
        # zaehlt hier bewusst NICHT als "Win", sonst waere die Sieg-
        # Quote fuer reines Solo-Training immer 100%.
        won = len(engine.players) > 1 and engine.winner_id == profile_id
        games_played += 1
        wins += 1 if won else 0

        for t in engine.throw_log:
            if t["playerId"] != profile_id:
                continue
            seg = t["segment"]
            number, mult = seg.get("number", 0), seg.get("multiplier", 0)
            total_darts += 1
            if number == 0 or mult == 0:
                misses += 1
            elif number == 25:
                bulls += 1
            elif mult == 1:
                singles += 1
            elif mult == 2:
                doubles += 1
            elif mult == 3:
                triples += 1

        is_checkout_family = engine.family_name in CHECKOUT_FAMILIES
        for v in engine.visit_log:
            if v["playerId"] != profile_id:
                continue
            if not is_checkout_family:
                continue
            scoring_points += v["value"]
            scoring_visits += 1
            if v["outcome"] == "checkout":
                checkouts_completed += 1
                checkout_darts_total += len(v["throws"])
                highest_checkout = max(highest_checkout, v["value"])

        game_id = row["game_id"]
        bucket = per_game.setdefault(game_id, {"gamesPlayed": 0, "wins": 0, "best": None, "metricName": None})
        bucket["gamesPlayed"] += 1
        bucket["wins"] += 1 if won else 0
        metric_name = PRIMARY_METRIC.get(engine.family_name)
        metric_value = state.get(metric_name) if metric_name else None
        bucket["metricName"] = metric_name
        if metric_value is not None and (bucket["best"] is None or metric_value > bucket["best"]):
            bucket["best"] = metric_value

        history.append({
            "matchId": row["id"],
            "gameId": game_id,
            "finishedAt": row["finished_at"],
            "won": won,
            "metricName": metric_name,
            "metricValue": metric_value,
        })

    return {
        "gamesPlayed": games_played,
        "wins": wins,
        "winPercent": _pct(wins, games_played),
        "accuracy": _pct(total_darts - misses, total_darts),
        "singlePercent": _pct(singles, total_darts),
        "doublePercent": _pct(doubles, total_darts),
        "triplePercent": _pct(triples, total_darts),
        "bullPercent": _pct(bulls, total_darts),
        "checkoutPercent": _pct(checkouts_completed, scoring_visits),
        "averageCheckoutDarts": round(checkout_darts_total / checkouts_completed, 2) if checkouts_completed else None,
        "highestCheckout": highest_checkout,
        "scoringAverage": round(scoring_points / scoring_visits, 2) if scoring_visits else None,
        "perGame": per_game,
        "history": list(reversed(history))[:50],
    }


def _format_config_label(game: dict, settings: dict) -> str:
    labels = {f["key"]: f.get("label", f["key"]) for f in game.get("settingsSchema", [])}
    parts = [f"{labels.get(key, key)}: {value}" for key, value in settings.items() if key in labels]
    return ", ".join(parts) if parts else "Standard"


def compute_leaderboards_for_game(game_id: str) -> list[dict]:
    """SPEC §34: ein lokales All-Time-Leaderboard je Spiel - getrennt
    nach Einstellungen (gameConfigurationHash), da unterschiedliche
    Settings nicht vergleichbar sind."""
    game = get_game(game_id)
    if game is None:
        return []
    metric_name = PRIMARY_METRIC.get(game["engineFamily"])
    if metric_name is None:
        return []

    rows = _load_finished_matches(game_id=game_id)
    buckets: dict[str, dict] = {}
    for row in rows:
        engine = _replay_match(row)
        if engine is None:
            continue
        settings = json.loads(row["config_json"])
        config_hash = row["config_hash"] or compute_config_hash(game_id, settings)
        bucket = buckets.setdefault(config_hash, {"configHash": config_hash, "settings": settings, "best": {}})
        for pid, state in engine.player_states.items():
            value = state.get(metric_name)
            if value is None:
                continue
            if pid not in bucket["best"] or value > bucket["best"][pid]:
                bucket["best"][pid] = value

    results = []
    for bucket in buckets.values():
        entries = sorted(bucket["best"].items(), key=lambda kv: kv[1], reverse=True)[:10]
        results.append({
            "configHash": bucket["configHash"],
            "configLabel": _format_config_label(game, bucket["settings"]),
            "metricName": metric_name,
            "entries": [{"profileId": pid, "value": v} for pid, v in entries],
        })
    return results
