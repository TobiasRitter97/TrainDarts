"""
AutodartsAdapter — verbindet sich mit dem Board Manager
(ws://<host>:3180/api/events) und normalisiert Würfe.

Übernimmt die am echten Board verifizierten Mechanismen aus dem
Prototyp (docs/reference/darts_web.py): Reconnect alle 3s,
Deduplizierung über throws[seen:], Takeout-Reset, Segment→Label.
Siehe CLAUDE.md "Verifizierte Autodarts-Anbindung" und
docs/ARCHITEKTUR.md Abschnitt 6. Keine Autodarts-Endpunkte erfinden.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable

import aiohttp
import websockets

log = logging.getLogger("darts.adapter")


def throw_label(segment: dict) -> str:
    number = segment.get("number", 0)
    multi = segment.get("multiplier", 0)
    if not number or not multi:
        return "MISS"
    if number == 25:
        return "BULL" if multi == 2 else "S25"
    prefix = {1: "S", 2: "D", 3: "T"}.get(multi, "?")
    return f"{prefix}{number}"


class AutodartsAdapter:
    def __init__(
        self,
        board_host: str = "localhost",
        board_port: int = 3180,
        on_status_change: Callable[[str], None] | None = None,
        on_throw: Callable[[str, dict], None] | None = None,
        on_takeout: Callable[[], None] | None = None,
    ):
        self.board_host = board_host
        self.board_port = board_port
        self.on_status_change = on_status_change
        self.on_throw = on_throw
        self.on_takeout = on_takeout
        self.status = "disconnected"
        self._seen_throws = 0

    def get_status(self) -> str:
        return self.status

    def calibration_url(self) -> str:
        return f"http://{self.board_host}:{self.board_port}"

    async def has_control_api(self) -> bool:
        """Prueft live, ob unter board_host tatsaechlich die REST-
        Steuer-API des echten Board Managers antwortet (CLAUDE.md
        "Verifizierte Board-Manager-REST-API"). Der lokale
        Wurf-Simulator (tools/board_simulator.py) bildet nur die
        WS-Events nach, hat aber kein /api/ping - darüber lassen sich
        Simulator und echtes Board unterscheiden, statt aufgrund des
        Hostnamens zu raten (der ist auf dem Pi in Produktion ebenso
        "localhost" wie hier im Dev-Betrieb fuer den Simulator)."""
        url = f"http://{self.board_host}:{self.board_port}/api/ping"
        timeout = aiohttp.ClientTimeout(total=2)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as resp:
                    return resp.status == 200
        except Exception:
            return False

    async def start(self) -> None:
        await self._control("PUT", "/api/start")

    async def stop(self) -> None:
        await self._control("PUT", "/api/stop")

    async def reset(self) -> None:
        await self._control("POST", "/api/reset")

    async def _control(self, method: str, path: str) -> None:
        """Board-Steuerung ueber die verifizierte REST-API des Board
        Managers (CLAUDE.md "Verifizierte Board-Manager-REST-API").
        Nur start/stop/reset - keine weiteren Endpunkte erfinden."""
        url = f"http://{self.board_host}:{self.board_port}{path}"
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(method, url) as resp:
                resp.raise_for_status()

    def _set_status(self, status: str) -> None:
        if status == self.status:
            return
        self.status = status
        if self.on_status_change:
            self.on_status_change(status)

    async def run(self) -> None:
        """Läuft endlos, reconnectet selbstständig — wie im Prototyp."""
        url = f"ws://{self.board_host}:{self.board_port}/api/events"
        while True:
            try:
                self._set_status("reconnecting")
                async with websockets.connect(url, open_timeout=5) as ws:
                    log.info("Board Manager verbunden: %s", url)
                    self._set_status("connected")
                    self._seen_throws = 0
                    async for message in ws:
                        self._handle_message(message)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.info("Board Manager nicht erreichbar (%s) — neuer Versuch in 3s", type(exc).__name__)
                self._set_status("disconnected")
                await asyncio.sleep(3)

    def _handle_message(self, message: str) -> None:
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            return
        if data.get("type") != "state":
            return
        d = data.get("data", {})
        event = d.get("event")
        if event == "Takeout finished":
            self._seen_throws = 0
            if self.on_takeout:
                self.on_takeout()
            return
        if event == "Throw detected":
            throws = d.get("throws", [])
            for t in throws[self._seen_throws:]:
                label = throw_label(t.get("segment", {}))
                if self.on_throw:
                    self.on_throw(label, t)
            self._seen_throws = len(throws)
