"""
Backend-Einstiegspunkt. Startet REST-API (Profile), Live-WebSocket
(Board-Status) und den AutodartsAdapter. Siehe docs/ARCHITEKTUR.md.

Start: python3 -m backend.app  (oder über ./dev.sh im Projekt-Root)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path

from aiohttp import web

from backend.adapter.autodarts import AutodartsAdapter
from backend.config import games as games_config
from backend.engine.engine import MatchEngine
from backend.persistence import matches as matches_db
from backend.persistence import models
from backend.persistence import stats as stats_db
from backend.persistence.db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("darts")

PORT = int(os.environ.get("DARTS_PORT", "8088"))
BOARD_HOST = os.environ.get("DARTS_BOARD_HOST", "localhost")

ws_clients: set[web.WebSocketResponse] = set()

# Rohe Live-Wurfanzeige fuer den einheitlichen Game Screen (Phase 6).
# Bewusst ohne Spiellogik: nur die Darts der laufenden Aufnahme und ein
# einfacher Zaehler, der bei jedem Takeout hochzaehlt. Echte Turn-/
# Score-Logik kommt erst mit der Game Engine in Phase 7.
live_state: dict = {"throws": [], "turnCount": 0}

# Es laeuft immer nur ein Match gleichzeitig (ein Board = ein aktives
# Spiel, docs/ARCHITEKTUR.md Abschnitt 6). Event-Log + Persistenz seit
# Phase 8 (engine.py / persistence/matches.py).
active_match: MatchEngine | None = None

# Match-ID eines beim Start gefundenen, nicht abgeschlossenen Matches,
# auf dessen Fortsetzen-oder-Verwerfen-Entscheidung das Frontend noch
# wartet (docs/ARCHITEKTUR.md Abschnitt 8). Wird NICHT automatisch in
# active_match geladen.
pending_resume_match_id: str | None = None


def _persist_active_match() -> None:
    if active_match is None:
        return
    status = "finished" if active_match.finished else "in_progress"
    matches_db.save_match(
        match_id=active_match.match_id,
        game_id=active_match.game["id"],
        settings=active_match.settings,
        player_ids=[p["id"] for p in active_match.players],
        events=active_match.events,
        status=status,
        winner_profile_id=active_match.winner_id,
    )


async def _broadcast_match_state() -> None:
    if active_match is not None:
        await broadcast({"type": "match_state", "data": active_match.to_dict()})


def live_snapshot() -> dict:
    """Kopie statt Referenz - sonst kann ein spaeter geplanter Broadcast
    (asyncio.ensure_future) bereits den Stand eines noch spaeteren Wurfs
    zeigen, wenn zwei Throws sehr schnell hintereinander eintreffen."""
    return {"throws": list(live_state["throws"]), "turnCount": live_state["turnCount"]}


async def broadcast(payload: dict) -> None:
    if not ws_clients:
        return
    msg = json.dumps(payload)
    for ws in list(ws_clients):
        try:
            await ws.send_str(msg)
        except Exception:
            ws_clients.discard(ws)


# ---------------------------------------------------------------- Profile
async def list_profiles(request: web.Request) -> web.Response:
    include_guests = request.query.get("include_guests") == "1"
    return web.json_response(models.list_profiles(include_guests=include_guests))


async def create_profile(request: web.Request) -> web.Response:
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        return web.json_response({"error": "name ist erforderlich"}, status=400)
    profile = models.create_profile(
        name=name,
        initials=body.get("initials"),
        color=body.get("color"),
        is_guest=bool(body.get("is_guest", False)),
    )
    return web.json_response(profile, status=201)


async def update_profile(request: web.Request) -> web.Response:
    profile_id = request.match_info["id"]
    body = await request.json()
    profile = models.update_profile(
        profile_id,
        name=body.get("name"),
        initials=body.get("initials"),
        color=body.get("color"),
    )
    if not profile:
        return web.json_response({"error": "nicht gefunden"}, status=404)
    return web.json_response(profile)


async def delete_profile(request: web.Request) -> web.Response:
    models.archive_profile(request.match_info["id"])
    return web.json_response({"ok": True})


async def merge_profile(request: web.Request) -> web.Response:
    models.merge_guest_into(request.match_info["guest_id"], request.match_info["profile_id"])
    return web.json_response({"ok": True})


async def profile_stats(request: web.Request) -> web.Response:
    """SPEC §5/§35: dauerhafte, ueber alle Matches hinweg berechnete
    Statistiken eines Profils (siehe backend/persistence/stats.py)."""
    profile_id = request.match_info["id"]
    if not models.get_profile(profile_id):
        return web.json_response({"error": "nicht gefunden"}, status=404)
    result = stats_db.compute_profile_stats(profile_id)
    for game_id, bucket in result["perGame"].items():
        game = games_config.get_game(game_id)
        bucket["gameName"] = game["name"] if game else game_id
    for entry in result["history"]:
        game = games_config.get_game(entry["gameId"])
        entry["gameName"] = game["name"] if game else entry["gameId"]
    return web.json_response(result)


# ---------------------------------------------------------------- Games
async def list_games(_request: web.Request) -> web.Response:
    return web.json_response(games_config.list_games())


async def game_leaderboard(request: web.Request) -> web.Response:
    """SPEC §34: lokales All-Time-Leaderboard, getrennt nach
    Einstellungen (gameConfigurationHash)."""
    game_id = request.match_info["id"]
    if not games_config.get_game(game_id):
        return web.json_response({"error": "unbekanntes Spiel"}, status=404)
    boards = stats_db.compute_leaderboards_for_game(game_id)
    for board in boards:
        for entry in board["entries"]:
            profile = models.get_profile(entry["profileId"])
            entry["name"] = profile["name"] if profile else "?"
            entry["color"] = profile["color"] if profile else None
    return web.json_response(boards)


# ---------------------------------------------------------------- Matches
async def create_match(request: web.Request) -> web.Response:
    global active_match, pending_resume_match_id
    body = await request.json()
    game_id = body.get("gameId")
    player_ids = body.get("playerIds") or []
    settings = body.get("settings") or {}

    game = games_config.get_game(game_id)
    if not game:
        return web.json_response({"error": "unbekanntes Spiel"}, status=400)
    if not game.get("implemented"):
        return web.json_response({"error": "Spiel noch nicht implementiert"}, status=400)
    if not player_ids:
        return web.json_response({"error": "mindestens 1 Spieler noetig"}, status=400)

    players = []
    for pid in player_ids:
        profile = models.get_profile(pid)
        if not profile:
            return web.json_response({"error": f"Profil {pid} nicht gefunden"}, status=400)
        players.append({
            "id": profile["id"],
            "name": profile["name"],
            "color": profile["color"],
            "initials": profile["initials"],
        })

    # Ein neues Match startet immer als DAS aktive Match - ein evtl.
    # noch nicht abgeschlossenes altes (laufend oder noch unbeantwortet
    # im Fortsetzen-Dialog) gilt damit implizit als aufgegeben.
    if active_match is not None and not active_match.finished:
        matches_db.set_status(active_match.match_id, "abandoned")
    if pending_resume_match_id is not None:
        matches_db.set_status(pending_resume_match_id, "abandoned")
        pending_resume_match_id = None

    match_id = str(uuid.uuid4())
    active_match = MatchEngine(match_id, game, players, settings)
    _persist_active_match()
    await _broadcast_match_state()
    return web.json_response({"matchId": match_id, "state": active_match.to_dict()}, status=201)


async def get_active_match(_request: web.Request) -> web.Response:
    if active_match is None:
        return web.json_response(None)
    return web.json_response(active_match.to_dict())


def _require_active_match(match_id: str) -> web.Response | None:
    """Sanity-Check: verhindert, dass ein Client versehentlich auf ein
    nicht (mehr) aktives Match einwirkt."""
    if active_match is None or active_match.match_id != match_id:
        return web.json_response({"error": "kein passendes aktives Match"}, status=409)
    return None


async def confirm_match_visit(request: web.Request) -> web.Response:
    match_id = request.match_info["id"]
    if (err := _require_active_match(match_id)) is not None:
        return err
    ok = active_match.confirm_visit()
    _persist_active_match()
    await _broadcast_match_state()
    return web.json_response({"ok": ok})


async def correct_match_throw(request: web.Request) -> web.Response:
    match_id = request.match_info["id"]
    if (err := _require_active_match(match_id)) is not None:
        return err
    body = await request.json()
    target_seq = body.get("throwSeq")
    segment = body.get("segment")
    if target_seq is None or not segment:
        return web.json_response({"error": "throwSeq und segment erforderlich"}, status=400)
    ok = active_match.correct_throw(int(target_seq), segment)
    _persist_active_match()
    await _broadcast_match_state()
    return web.json_response({"ok": ok})


async def undo_match(request: web.Request) -> web.Response:
    match_id = request.match_info["id"]
    if (err := _require_active_match(match_id)) is not None:
        return err
    ok = active_match.undo()
    _persist_active_match()
    await _broadcast_match_state()
    return web.json_response({"ok": ok})


async def add_match_throw(request: web.Request) -> web.Response:
    """+ DART (SPEC §15): manuelle Eingabe eines nicht erkannten Wurfs."""
    match_id = request.match_info["id"]
    if (err := _require_active_match(match_id)) is not None:
        return err
    body = await request.json()
    segment = body.get("segment")
    if not segment:
        return web.json_response({"error": "segment erforderlich"}, status=400)
    ok = active_match.add_manual_throw(segment)
    _persist_active_match()
    await _broadcast_match_state()
    return web.json_response({"ok": ok})


# ---------------------------------------------------------------- Fortsetzen nach Neustart
async def pending_resume_info(_request: web.Request) -> web.Response:
    if pending_resume_match_id is None:
        return web.json_response(None)
    row = matches_db.find_in_progress_match()
    if row is None or row["id"] != pending_resume_match_id:
        return web.json_response(None)
    game = games_config.get_game(row["game_id"])
    player_ids = matches_db.load_match_player_ids(row["id"])
    player_names = [p["name"] for pid in player_ids if (p := models.get_profile(pid))]
    return web.json_response({
        "matchId": row["id"],
        "gameId": row["game_id"],
        "gameName": game["name"] if game else row["game_id"],
        "playerNames": player_names,
    })


async def resume_match(request: web.Request) -> web.Response:
    global active_match, pending_resume_match_id
    match_id = request.match_info["id"]
    if pending_resume_match_id != match_id:
        return web.json_response({"error": "kein fortsetzbares Match mit dieser ID"}, status=409)

    row = matches_db.find_in_progress_match()
    game = games_config.get_game(row["game_id"]) if row else None
    if row is None or game is None:
        pending_resume_match_id = None
        return web.json_response({"error": "Match nicht mehr vorhanden"}, status=404)

    player_ids = matches_db.load_match_player_ids(match_id)
    players = []
    for pid in player_ids:
        profile = models.get_profile(pid)
        if profile:
            players.append({"id": profile["id"], "name": profile["name"],
                             "color": profile["color"], "initials": profile["initials"]})
    settings = matches_db.load_match_settings(match_id)
    events = matches_db.load_match_events(match_id)

    active_match = MatchEngine(match_id, game, players, settings, events=events)
    pending_resume_match_id = None
    await _broadcast_match_state()
    return web.json_response(active_match.to_dict())


async def abandon_match(request: web.Request) -> web.Response:
    global pending_resume_match_id
    match_id = request.match_info["id"]
    if pending_resume_match_id != match_id:
        return web.json_response({"error": "kein fortsetzbares Match mit dieser ID"}, status=409)
    matches_db.set_status(match_id, "abandoned")
    pending_resume_match_id = None
    return web.json_response({"ok": True})


# ---------------------------------------------------------------- Board control
# Proxy zum Board Manager, damit der Browser weiterhin nur mit unserem
# Backend spricht (CLAUDE.md: "Browser spricht NUR mit unserem Backend,
# nie mit dem Board Manager"). Nutzt ausschliesslich die in CLAUDE.md
# verifizierten Endpunkte (/api/start, /api/stop, /api/reset).
async def board_info(request: web.Request) -> web.Response:
    adapter: AutodartsAdapter = request.app["adapter"]
    has_control_api = await adapter.has_control_api()
    return web.json_response({
        "boardHost": adapter.board_host,
        "boardPort": adapter.board_port,
        "calibrationUrl": adapter.calibration_url(),
        "hasControlApi": has_control_api,
    })


async def board_start(request: web.Request) -> web.Response:
    return await _board_control(request, "start")


async def board_stop(request: web.Request) -> web.Response:
    return await _board_control(request, "stop")


async def board_reset(request: web.Request) -> web.Response:
    return await _board_control(request, "reset")


async def _board_control(request: web.Request, action: str) -> web.Response:
    adapter: AutodartsAdapter = request.app["adapter"]
    try:
        await getattr(adapter, action)()
    except Exception as exc:
        log.warning("Board-Steuerung '%s' fehlgeschlagen: %s", action, exc)
        return web.json_response({"error": f"Board nicht erreichbar ({type(exc).__name__})"}, status=502)
    return web.json_response({"ok": True})


# ---------------------------------------------------------------- WebSocket
async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    ws_clients.add(ws)
    try:
        adapter: AutodartsAdapter = request.app["adapter"]
        await ws.send_str(json.dumps({"type": "board_status", "data": {"status": adapter.get_status()}}))
        await ws.send_str(json.dumps({"type": "live", "data": live_snapshot()}))
        if active_match is not None:
            await ws.send_str(json.dumps({"type": "match_state", "data": active_match.to_dict()}))
        async for _msg in ws:
            pass  # Kommandos laufen ueber REST (/api/matches/{id}/...), nicht ueber den WS
    except ConnectionResetError:
        # Normaler Fall beim Neuladen/Schliessen der Seite - der Browser
        # kappt die Verbindung oft, ohne einen sauberen Close-Frame zu
        # senden. Kein Fehler, kein Traceback noetig.
        pass
    finally:
        ws_clients.discard(ws)
    return ws


@web.middleware
async def cors_middleware(request: web.Request, handler):
    """Noetig seit dem Vercel-Deployment (Frontend und Backend laufen
    auf unterschiedlichen Origins - Frontend auf Vercel, Backend auf
    dem Pi im Heimnetz, siehe frontend/src/piConnection.ts). Keine
    Authentifizierung in dieser App, daher reicht ein offener CORS-
    Header ("*") - er erlaubt lediglich das Lesen der Antworten, nicht
    mehr Zugriff auf das Backend als ohnehin schon (jeder im selben
    Heimnetz kann die REST-API direkt aufrufen)."""
    if request.method == "OPTIONS":
        response = web.Response()
    else:
        try:
            response = await handler(request)
        except web.HTTPException as exc:
            response = exc
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# ---------------------------------------------------------------- App-Setup
def make_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])

    app.router.add_get("/api/profiles", list_profiles)
    app.router.add_post("/api/profiles", create_profile)
    app.router.add_put("/api/profiles/{id}", update_profile)
    app.router.add_delete("/api/profiles/{id}", delete_profile)
    app.router.add_post("/api/profiles/{guest_id}/merge-into/{profile_id}", merge_profile)
    app.router.add_get("/api/profiles/{id}/stats", profile_stats)

    app.router.add_get("/api/games", list_games)
    app.router.add_get("/api/games/{id}/leaderboard", game_leaderboard)

    app.router.add_post("/api/matches", create_match)
    app.router.add_get("/api/matches/active", get_active_match)
    app.router.add_post("/api/matches/{id}/confirm", confirm_match_visit)
    app.router.add_post("/api/matches/{id}/correct", correct_match_throw)
    app.router.add_post("/api/matches/{id}/undo", undo_match)
    app.router.add_post("/api/matches/{id}/add-throw", add_match_throw)
    app.router.add_get("/api/matches/pending-resume", pending_resume_info)
    app.router.add_post("/api/matches/{id}/resume", resume_match)
    app.router.add_post("/api/matches/{id}/abandon", abandon_match)

    app.router.add_get("/api/board/info", board_info)
    app.router.add_post("/api/board/start", board_start)
    app.router.add_post("/api/board/stop", board_stop)
    app.router.add_post("/api/board/reset", board_reset)

    app.router.add_get("/ws", ws_handler)

    dist_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if dist_dir.exists():
        app.router.add_static("/assets", dist_dir / "assets")

        async def index(_request: web.Request) -> web.FileResponse:
            return web.FileResponse(dist_dir / "index.html")

        app.router.add_get("/", index)
    else:
        async def index(_request: web.Request) -> web.Response:
            return web.Response(
                text=(
                    "Backend laeuft.\n\n"
                    "Frontend noch nicht eingerichtet oder im Entwicklungsmodus:\n"
                    "  cd frontend && npm run dev\n"
                    "und dann http://localhost:5173 oeffnen.\n"
                )
            )

        app.router.add_get("/", index)

    def on_status_change(status: str) -> None:
        log.info("Board-Status: %s", status)
        asyncio.ensure_future(broadcast({"type": "board_status", "data": {"status": status}}))

    def on_throw(label: str, raw: dict) -> None:
        live_state["throws"] = [*live_state["throws"], label]
        asyncio.ensure_future(broadcast({"type": "live", "data": live_snapshot()}))
        if active_match is not None:
            active_match.handle_throw(label, raw)
            _persist_active_match()
            asyncio.ensure_future(_broadcast_match_state())

    def on_takeout() -> None:
        live_state["throws"] = []
        live_state["turnCount"] += 1
        asyncio.ensure_future(broadcast({"type": "live", "data": live_snapshot()}))
        # Takeout bestaetigt die Aufnahme (Abschnitt 2.1) - erst jetzt
        # greifen Spielerwechsel, Leg-/Run-Ende usw.
        if active_match is not None:
            active_match.confirm_visit()
            _persist_active_match()
            asyncio.ensure_future(_broadcast_match_state())

    adapter = AutodartsAdapter(
        board_host=BOARD_HOST,
        on_status_change=on_status_change,
        on_throw=on_throw,
        on_takeout=on_takeout,
    )
    app["adapter"] = adapter

    async def start_adapter(app: web.Application) -> None:
        global pending_resume_match_id
        row = matches_db.find_in_progress_match()
        if row is not None:
            pending_resume_match_id = row["id"]
            log.info("Unterbrochenes Match gefunden (%s) - wartet auf Fortsetzen/Verwerfen", row["id"])
        app["adapter_task"] = asyncio.create_task(app["adapter"].run())

    async def stop_adapter(app: web.Application) -> None:
        app["adapter_task"].cancel()

    app.on_startup.append(start_adapter)
    app.on_cleanup.append(stop_adapter)

    return app


def main() -> None:
    init_db()
    app = make_app()
    if BOARD_HOST in ("localhost", "127.0.0.1"):
        board_desc = f"{BOARD_HOST}:3180 (lokaler Wurf-Simulator erwartet, tools/board_simulator.py)"
    else:
        board_desc = f"{BOARD_HOST}:3180 (echtes Board)"
    log.info("=" * 60)
    log.info("Backend:       http://localhost:%d", PORT)
    log.info("Board Manager: %s", board_desc)
    log.info("=" * 60)
    web.run_app(app, port=PORT, print=None)


if __name__ == "__main__":
    main()
