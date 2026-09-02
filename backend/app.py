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
from pathlib import Path

from aiohttp import web

from backend.adapter.autodarts import AutodartsAdapter
from backend.config import games as games_config
from backend.persistence import models
from backend.persistence.db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("darts")

PORT = int(os.environ.get("DARTS_PORT", "8088"))
BOARD_HOST = os.environ.get("DARTS_BOARD_HOST", "localhost")

ws_clients: set[web.WebSocketResponse] = set()


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


# ---------------------------------------------------------------- Games
async def list_games(_request: web.Request) -> web.Response:
    return web.json_response(games_config.list_games())


# ---------------------------------------------------------------- Board control
# Proxy zum Board Manager, damit der Browser weiterhin nur mit unserem
# Backend spricht (CLAUDE.md: "Browser spricht NUR mit unserem Backend,
# nie mit dem Board Manager"). Nutzt ausschliesslich die in CLAUDE.md
# verifizierten Endpunkte (/api/start, /api/stop, /api/reset).
async def board_info(request: web.Request) -> web.Response:
    adapter: AutodartsAdapter = request.app["adapter"]
    return web.json_response({
        "boardHost": adapter.board_host,
        "boardPort": adapter.board_port,
        "calibrationUrl": adapter.calibration_url(),
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
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    ws_clients.add(ws)
    adapter: AutodartsAdapter = request.app["adapter"]
    await ws.send_str(json.dumps({"type": "board_status", "data": {"status": adapter.get_status()}}))
    try:
        async for _msg in ws:
            pass  # Korrektur-/Undo-Kommandos folgen ab Phase 7/8
    finally:
        ws_clients.discard(ws)
    return ws


# ---------------------------------------------------------------- App-Setup
def make_app() -> web.Application:
    app = web.Application()

    app.router.add_get("/api/profiles", list_profiles)
    app.router.add_post("/api/profiles", create_profile)
    app.router.add_put("/api/profiles/{id}", update_profile)
    app.router.add_delete("/api/profiles/{id}", delete_profile)
    app.router.add_post("/api/profiles/{guest_id}/merge-into/{profile_id}", merge_profile)

    app.router.add_get("/api/games", list_games)

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

    adapter = AutodartsAdapter(board_host=BOARD_HOST, on_status_change=on_status_change)
    app["adapter"] = adapter

    async def start_adapter(app: web.Application) -> None:
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
