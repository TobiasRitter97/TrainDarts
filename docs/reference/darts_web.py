#!/usr/bin/env python3
"""
Doppel-Training — Web-Edition
==============================
Verbindet sich mit dem lokalen Autodarts Board Manager (Port 3180)
und hostet eine Touch-Oberflaeche fuers Tablet neben der Scheibe.

Features:
  - Around the Doubles: D1 -> D20 -> Bullseye
  - Live-Anzeige jedes erkannten Wurfs
  - Korrekturen per Button:
      * Ruckgaengig  — letzten Wurf verwerfen (Fehlerkennung)
      * Bouncer      — Dart zaehlen, der nicht stecken blieb
      * Treffer      — nicht erkannten Treffer manuell gutschreiben
      * Neustart     — neue Runde
  - Statistik am Ende (Darts, Dauer, Angstgegner)

Installation:  pip install websockets aiohttp --break-system-packages
Start:         python3 darts_web.py
Anzeige:       http://<pi-ip>:8088  im Browser auf Tablet/Handy/PC
Beenden:       ctrl+C
"""

import asyncio
import json
import sys
import time
from collections import defaultdict

try:
    import websockets
    from aiohttp import web, WSMsgType
except ImportError:
    sys.exit("Bitte zuerst installieren:\n  pip install websockets aiohttp --break-system-packages")

BOARD_HOST = sys.argv[1] if len(sys.argv) > 1 else "localhost"
BOARD_WS = f"ws://{BOARD_HOST}:3180/api/events"
WEB_PORT = 8088

TARGETS = [f"D{i}" for i in range(1, 21)] + ["BULL"]


# ----------------------------------------------------------------------
# Wurf-Parsing (Format deines Board Managers, verifiziert)
# ----------------------------------------------------------------------
def throw_label(segment: dict) -> str:
    number = segment.get("number", 0)
    multi = segment.get("multiplier", 0)
    if not number or not multi:
        return "MISS"
    if number == 25:
        return "BULL" if multi == 2 else "S25"
    prefix = {1: "S", 2: "D", 3: "T"}.get(multi, "?")
    return f"{prefix}{number}"


# ----------------------------------------------------------------------
# Spiellogik mit Undo-Historie
# ----------------------------------------------------------------------
class DoublesGame:
    def __init__(self):
        self.reset()

    def reset(self):
        self.idx = 0
        self.history = []            # [{label, hit, target_idx, manual}]
        self.start_time = time.time()
        self.finished = False

    @property
    def target(self):
        return TARGETS[min(self.idx, len(TARGETS) - 1)]

    def throw(self, label: str, manual: bool = False):
        if self.finished:
            return
        hit = (label == TARGETS[self.idx])
        self.history.append(
            {"label": label, "hit": hit, "target_idx": self.idx, "manual": manual}
        )
        if hit:
            self.idx += 1
            if self.idx >= len(TARGETS):
                self.finished = True

    def manual_hit(self):
        self.throw(self.target, manual=True)

    def bouncer(self):
        self.throw("BOUNCER", manual=True)

    def undo(self):
        if not self.history:
            return
        rec = self.history.pop()
        self.finished = False
        if rec["hit"]:
            self.idx = rec["target_idx"]

    def state(self) -> dict:
        per_target = defaultdict(int)
        for rec in self.history:
            per_target[TARGETS[rec["target_idx"]]] += 1
        worst = max(per_target.items(), key=lambda kv: kv[1]) if per_target else None
        return {
            "targets": TARGETS,
            "idx": self.idx,
            "target": self.target,
            "finished": self.finished,
            "darts_total": len(self.history),
            "darts_on_target": per_target.get(self.target, 0) if not self.finished else 0,
            "history": self.history[-9:],
            "duration_s": round(time.time() - self.start_time),
            "worst": {"target": worst[0], "darts": worst[1]} if worst else None,
        }


game = DoublesGame()
clients: set = set()


async def broadcast():
    if not clients:
        return
    msg = json.dumps({"type": "state", "data": game.state()})
    for ws in list(clients):
        try:
            await ws.send_str(msg)
        except Exception:
            clients.discard(ws)


# ----------------------------------------------------------------------
# Board-Manager-Listener (mit automatischem Reconnect)
# ----------------------------------------------------------------------
async def board_listener():
    seen_throws = 0
    while True:
        try:
            async with websockets.connect(BOARD_WS, open_timeout=5) as ws:
                print(f"[OK] Board Manager verbunden: {BOARD_WS}")
                seen_throws = 0
                async for message in ws:
                    try:
                        data = json.loads(message)
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") != "state":
                        continue
                    d = data.get("data", {})
                    event = d.get("event")
                    if event == "Takeout finished":
                        seen_throws = 0
                        continue
                    if event == "Throw detected":
                        throws = d.get("throws", [])
                        for t in throws[seen_throws:]:
                            game.throw(throw_label(t.get("segment", {})))
                        seen_throws = len(throws)
                        await broadcast()
        except Exception as e:
            print(f"[..] Board Manager nicht erreichbar ({type(e).__name__}) — neuer Versuch in 3s")
            await asyncio.sleep(3)


# ----------------------------------------------------------------------
# Web-Oberflaeche
# ----------------------------------------------------------------------
PAGE = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Doppel-Training</title>
<style>
  :root{
    --sisal:#EDE4CE;      /* Scheiben-Beige */
    --coal:#161A17;       /* Hintergrund */
    --coal2:#1F2420;
    --wire:#3A423C;       /* Spinnendraht */
    --red:#C8322B;        /* Doppel-Rot */
    --green:#1E8A4C;      /* Doppel-Gruen */
    --muted:#8C9489;
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{height:100%}
  body{
    background:var(--coal);color:var(--sisal);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    display:flex;flex-direction:column;align-items:center;
    padding:14px 16px calc(14px + env(safe-area-inset-bottom));
    user-select:none;
  }
  header{width:100%;max-width:640px;display:flex;justify-content:space-between;
    align-items:baseline;color:var(--muted);font-size:15px}
  header .conn.off{color:var(--red)}

  /* Ziel-Anzeige: Doppelring wie ein Doppel-Bett */
  .ring{
    margin:4vh 0 3vh;width:min(58vw,340px);aspect-ratio:1;border-radius:50%;
    border:10px solid var(--green);outline:10px solid var(--red);outline-offset:8px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:var(--coal2);
  }
  .ring.done{border-color:var(--sisal);outline-color:var(--sisal)}
  .ring .t{font-size:clamp(64px,17vw,110px);font-weight:800;letter-spacing:-.02em;line-height:1}
  .ring .sub{color:var(--muted);font-size:16px;margin-top:6px}

  /* Fortschritt: 21 Segmente */
  .prog{display:flex;gap:3px;width:100%;max-width:640px}
  .prog i{flex:1;height:9px;border-radius:2px;background:var(--wire)}
  .prog i.done{background:var(--green)}
  .prog i.cur{background:var(--red)}

  /* Wurf-Historie */
  .hist{display:flex;gap:8px;margin:16px 0 4px;min-height:44px;flex-wrap:wrap;
    justify-content:center;max-width:640px}
  .chip{padding:9px 13px;border-radius:8px;font-weight:700;font-size:17px;
    background:var(--coal2);border:1px solid var(--wire)}
  .chip.hit{border-color:var(--green);color:#7BD8A2}
  .chip.miss{color:var(--sisal)}
  .chip.man{border-style:dashed}

  .stats{color:var(--muted);font-size:15px;margin-bottom:12px}

  /* Buttons */
  .btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:640px;margin-top:auto}
  button{
    padding:20px 8px;font-size:19px;font-weight:700;border-radius:12px;
    border:1px solid var(--wire);background:var(--coal2);color:var(--sisal);
    cursor:pointer;
  }
  button:active{transform:scale(.97)}
  button.hit{background:var(--green);border-color:var(--green);color:#fff}
  button.undo{background:var(--red);border-color:var(--red);color:#fff}

  /* Endscreen */
  .final{text-align:center;margin:2vh 0}
  .final h2{font-size:34px;margin-bottom:12px}
  .final p{font-size:18px;line-height:1.7}
</style>
</head>
<body>
  <header>
    <span>Doppel-Training</span>
    <span class="conn" id="conn">verbinde…</span>
  </header>

  <div id="app"></div>

  <div class="btns">
    <button class="hit"  onclick="cmd('hit')">Treffer ✓</button>
    <button              onclick="cmd('bouncer')">Bouncer</button>
    <button class="undo" onclick="cmd('undo')">Rückgängig ↩</button>
    <button              onclick="if(confirm('Neue Runde starten?'))cmd('restart')">Neustart</button>
  </div>

<script>
let ws;
function connect(){
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen  = ()=>{ conn(true); };
  ws.onclose = ()=>{ conn(false); setTimeout(connect, 1500); };
  ws.onmessage = (e)=>{
    const m = JSON.parse(e.data);
    if(m.type === "state") render(m.data);
  };
}
function conn(ok){
  const el = document.getElementById("conn");
  el.textContent = ok ? "verbunden" : "getrennt";
  el.classList.toggle("off", !ok);
}
function cmd(c){ if(ws && ws.readyState===1) ws.send(JSON.stringify({cmd:c})); }

function render(s){
  const app = document.getElementById("app");
  const mins = Math.floor(s.duration_s/60), secs = s.duration_s%60;

  if(s.finished){
    app.innerHTML = `
      <div class="ring done"><div class="t">🏆</div><div class="sub">Geschafft!</div></div>
      <div class="final">
        <h2>Alle Doppel + Bull</h2>
        <p>${s.darts_total} Darts · ${mins}:${String(secs).padStart(2,"0")} min<br>
        ${s.worst ? "Angstgegner: <b>"+s.worst.target+"</b> ("+s.worst.darts+" Darts)" : ""}</p>
      </div>`;
    return;
  }

  const prog = s.targets.map((t,i)=>
    `<i class="${i<s.idx?"done":i===s.idx?"cur":""}"></i>`).join("");

  const hist = s.history.slice().reverse().map(h=>
    `<div class="chip ${h.hit?"hit":"miss"} ${h.manual?"man":""}">${h.label}</div>`
  ).join("") || `<div class="chip miss" style="opacity:.45">Wirf den ersten Dart</div>`;

  app.innerHTML = `
    <div class="ring">
      <div class="t">${s.target}</div>
      <div class="sub">${s.darts_on_target} Darts auf dieses Ziel</div>
    </div>
    <div class="prog">${prog}</div>
    <div class="hist">${hist}</div>
    <div class="stats">${s.darts_total} Darts gesamt · ${mins}:${String(secs).padStart(2,"0")} min</div>`;
}
connect();
</script>
</body>
</html>"""


async def index(request):
    return web.Response(text=PAGE, content_type="text/html")


async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    await ws.send_str(json.dumps({"type": "state", "data": game.state()}))
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                cmd = json.loads(msg.data).get("cmd")
            except json.JSONDecodeError:
                continue
            if cmd == "undo":
                game.undo()
            elif cmd == "bouncer":
                game.bouncer()
            elif cmd == "hit":
                game.manual_hit()
            elif cmd == "restart":
                game.reset()
            await broadcast()
    finally:
        clients.discard(ws)
    return ws


async def main():
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/ws", ws_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", WEB_PORT)
    await site.start()
    print(f"[OK] Web-Oberflaeche laeuft:  http://<pi-ip>:{WEB_PORT}")
    print("     (auf dem Pi selbst: http://localhost:%d)" % WEB_PORT)

    await board_listener()  # laeuft endlos, reconnectet selbststaendig


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBeendet.")
