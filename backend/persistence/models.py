"""Profil-Zugriff. Siehe docs/ARCHITEKTUR.md Abschnitt 5."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from .db import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_profiles(include_guests: bool = False, include_archived: bool = False) -> list[dict]:
    query = "SELECT * FROM profiles WHERE merged_into_profile_id IS NULL"
    if not include_archived:
        query += " AND archived_at IS NULL"
    if not include_guests:
        query += " AND is_guest = 0"
    query += " ORDER BY created_at ASC"
    conn = get_connection()
    rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_profile(profile_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_profile(name: str, initials: str | None = None, color: str | None = None,
                    is_guest: bool = False) -> dict:
    profile_id = str(uuid.uuid4())
    conn = get_connection()
    with conn:
        conn.execute(
            "INSERT INTO profiles (id, name, initials, color, is_guest, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (profile_id, name, initials, color, int(is_guest), _now()),
        )
    conn.close()
    return get_profile(profile_id)


def update_profile(profile_id: str, name: str | None = None, initials: str | None = None,
                    color: str | None = None) -> dict | None:
    fields, values = [], []
    if name is not None:
        fields.append("name = ?"); values.append(name)
    if initials is not None:
        fields.append("initials = ?"); values.append(initials)
    if color is not None:
        fields.append("color = ?"); values.append(color)
    if not fields:
        return get_profile(profile_id)
    values.append(profile_id)
    conn = get_connection()
    with conn:
        conn.execute(f"UPDATE profiles SET {', '.join(fields)} WHERE id = ?", values)
    conn.close()
    return get_profile(profile_id)


def archive_profile(profile_id: str) -> None:
    """Soft-Delete: Profil verschwindet aus der Auswahl, alte Matches bleiben gültig."""
    conn = get_connection()
    with conn:
        conn.execute("UPDATE profiles SET archived_at = ? WHERE id = ?", (_now(), profile_id))
    conn.close()


def merge_guest_into(guest_id: str, target_profile_id: str) -> None:
    """Ordnet einen Gast nachträglich einem echten Profil zu (ARCHITEKTUR.md Abschnitt 5)."""
    conn = get_connection()
    with conn:
        conn.execute(
            "UPDATE profiles SET merged_into_profile_id = ? WHERE id = ?",
            (target_profile_id, guest_id),
        )
    conn.close()
