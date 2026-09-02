"""SQLite-Setup. Schema wie in docs/ARCHITEKTUR.md Abschnitt 8 beschlossen."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "darts.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    initials TEXT,
    color TEXT,
    is_guest INTEGER NOT NULL DEFAULT 0,
    merged_into_profile_id TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    config_json TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    duration_mode TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TEXT NOT NULL,
    finished_at TEXT,
    winner_profile_id TEXT
);

CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    seat_order INTEGER NOT NULL,
    PRIMARY KEY (match_id, profile_id)
);

CREATE TABLE IF NOT EXISTS match_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS highscores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    match_id TEXT,
    achieved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stats_summary (
    profile_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, game_id)
);
"""


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    with conn:
        conn.executescript(SCHEMA)
    conn.close()
