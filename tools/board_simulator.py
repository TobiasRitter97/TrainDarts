#!/usr/bin/env python3
"""
Wurf-Simulator — ersetzt lokal den echten Autodarts Board Manager.

Emuliert ws://localhost:3180/api/events exakt im verifizierten Format
(siehe CLAUDE.md "Verifizierte Autodarts-Anbindung"), damit
AutodartsAdapter und spaeter die Game Engine ohne Dartscheibe
getestet werden koennen (die echte Scheibe haengt am Pi).

Start:  python3 tools/board_simulator.py
Danach Darts eingeben:
  T20, D16, S5, 1..20      einzelner Wurf
  25                        Single Bull (Outer Bull)
  BULL                      Bullseye
  MISS oder 0                verfehlt
  takeout                    Aufnahme beendet (wie Dart-Rausziehen)
  q                          beenden
"""
import asyncio
import json
import sys

try:
    import websockets
except ImportError:
    sys.exit("Bitte zuerst installieren: pip3 install websockets")

PORT = 3180
clients: set = set()
throws: list = []  # kumulierte Wuerfe der aktuellen Aufnahme, wie am echten Board


def parse_dart(raw: str):
    raw = raw.strip().upper()
    if raw in ("MISS", "0"):
        return {"number": 0, "multiplier": 0, "bed": "MISS", "name": "MISS"}
    if raw in ("BULL", "DBULL"):
        return {"number": 25, "multiplier": 2, "bed": "DBULL", "name": "BULL"}
    if raw in ("25", "SBULL", "S25"):
        return {"number": 25, "multiplier": 1, "bed": "BULL", "name": "S25"}
    prefix = raw[0]
    mult = {"S": 1, "D": 2, "T": 3}.get(prefix)
    if mult and raw[1:].isdigit():
        number = int(raw[1:])
        if 1 <= number <= 20:
            return {"number": number, "multiplier": mult, "bed": f"{prefix}{number}", "name": f"{prefix}{number}"}
    if raw.isdigit() and 1 <= int(raw) <= 20:
        number = int(raw)
        return {"number": number, "multiplier": 1, "bed": f"S{number}", "name": f"S{number}"}
    return None


async def broadcast(payload: dict) -> None:
    if not clients:
        return
    msg = json.dumps(payload)
    for ws in list(clients):
        try:
            await ws.send(msg)
        except Exception:
            clients.discard(ws)


async def handler(ws) -> None:
    clients.add(ws)
    print(f"[verbunden] Client verbunden ({len(clients)} gesamt)")
    try:
        async for _ in ws:
            pass
    finally:
        clients.discard(ws)
        print(f"[getrennt] Client getrennt ({len(clients)} gesamt)")


async def send_throw(segment: dict) -> None:
    throws.append({"segment": segment, "coords": {"x": 0, "y": 0}})
    await broadcast({"type": "state", "data": {"event": "Throw detected", "throws": throws}})


async def send_takeout() -> None:
    throws.clear()
    await broadcast({"type": "state", "data": {"event": "Takeout finished"}})


async def input_loop() -> None:
    loop = asyncio.get_event_loop()
    print(f"Wurf-Simulator laeuft auf ws://localhost:{PORT}/api/events")
    print("Eingabe: T20 / D16 / S5 / 25 (Single Bull) / BULL / MISS / takeout / q\n")
    while True:
        raw = await loop.run_in_executor(None, input, "> ")
        raw = raw.strip()
        if raw.lower() in ("q", "quit", "exit"):
            print("Beendet.")
            return
        if raw.lower() in ("takeout", "t"):
            await send_takeout()
            print("  -> Takeout (Aufnahme zurueckgesetzt)")
            continue
        segment = parse_dart(raw)
        if segment is None:
            print("  Unbekannte Eingabe. Beispiele: T20, D16, S5, 25, BULL, MISS, takeout, q")
            continue
        await send_throw(segment)
        print(f"  -> gesendet: {segment['name']} (Dart {len(throws)} der Aufnahme)")


async def main() -> None:
    async with websockets.serve(handler, "localhost", PORT):
        await input_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
