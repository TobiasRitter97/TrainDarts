"""Persistenz fuer Matches und ihr Event-Log (docs/ARCHITEKTUR.md
Abschnitt 8). Schreibt bei jeder Aenderung das komplette Event-Log neu
(Matches bleiben klein genug, dass das unproblematisch ist) - das
vermeidet fehleranfaellige inkrementelle Delete/Insert-Abgleiche bei
Undo/Korrektur."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from .db import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def save_match(match_id: str, game_id: str, settings: dict, player_ids: list[str],
               events: list[dict], status: str = "in_progress",
               winner_profile_id: str | None = None) -> None:
    conn = get_connection()
    with conn:
        existing = conn.execute("SELECT started_at FROM matches WHERE id = ?", (match_id,)).fetchone()
        started_at = existing["started_at"] if existing else _now()
        finished_at = _now() if status == "finished" else None

        conn.execute(
            "INSERT INTO matches (id, game_id, config_json, config_hash, duration_mode, "
            "status, started_at, finished_at, winner_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET status=excluded.status, "
            "finished_at=excluded.finished_at, winner_profile_id=excluded.winner_profile_id",
            (match_id, game_id, json.dumps(settings), "", None, status, started_at,
             finished_at, winner_profile_id),
        )

        conn.execute("DELETE FROM match_players WHERE match_id = ?", (match_id,))
        for i, pid in enumerate(player_ids):
            conn.execute(
                "INSERT INTO match_players (match_id, profile_id, seat_order) VALUES (?, ?, ?)",
                (match_id, pid, i),
            )

        conn.execute("DELETE FROM match_events WHERE match_id = ?", (match_id,))
        for seq, e in enumerate(events):
            conn.execute(
                "INSERT INTO match_events (match_id, seq, type, payload_json, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (match_id, seq, e["type"], json.dumps(e["payload"]), _now()),
            )
    conn.close()


def set_status(match_id: str, status: str, winner_profile_id: str | None = None) -> None:
    conn = get_connection()
    with conn:
        conn.execute(
            "UPDATE matches SET status = ?, finished_at = ?, winner_profile_id = ? WHERE id = ?",
            (status, _now() if status in ("finished", "abandoned") else None, winner_profile_id, match_id),
        )
    conn.close()


def find_in_progress_match() -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM matches WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def load_match_player_ids(match_id: str) -> list[str]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT profile_id FROM match_players WHERE match_id = ? ORDER BY seat_order", (match_id,)
    ).fetchall()
    conn.close()
    return [r["profile_id"] for r in rows]


def load_match_events(match_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT type, payload_json FROM match_events WHERE match_id = ? ORDER BY seq", (match_id,)
    ).fetchall()
    conn.close()
    return [{"type": r["type"], "payload": json.loads(r["payload_json"])} for r in rows]


def load_match_settings(match_id: str) -> dict:
    conn = get_connection()
    row = conn.execute("SELECT config_json FROM matches WHERE id = ?", (match_id,)).fetchone()
    conn.close()
    return json.loads(row["config_json"]) if row else {}
