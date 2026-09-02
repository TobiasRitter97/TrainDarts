# Phase 3 — Design System

Stand: 02.09.2026.

Dieses Dokument beschreibt das visuelle Grundgerüst der Anwendung —
so wie `docs/ARCHITEKTUR.md` das technische Grundgerüst beschreibt.
Zu jedem Baustein steht zuerst in einfachen Worten, was er ist und
warum er so gewählt wurde, danach die konkreten Werte.

Die eigentlichen Werte liegen als CSS-Datei in
`docs/design/tokens.css` — das ist die einzige Quelle der Wahrheit.
Eine lebendige Vorschau mit allen Farben, Schriftgrößen, Buttons und
Beispiel-Elementen liegt in `docs/design/styleguide.html` (Anleitung
zum Öffnen am Ende dieses Dokuments).

Es wird noch keine echte Bildschirmseite gebaut — das beginnt in
Phase 4. Dieses Dokument legt nur die gemeinsame Formsprache fest,
auf der alle späteren Bildschirme aufbauen.

---

## 1. Warum ein Design-System statt Einzelentscheidungen

**Einfach erklärt:** Statt bei jedem neuen Bildschirm neu zu
entscheiden, wie ein Button aussieht oder welches Rot "Fehler"
bedeutet, gibt es eine feste Liste von Werten (Farben, Schriftgrößen,
Abstände), die überall wiederverwendet wird. Ändert sich später z. B.
der Gold-Ton, ändert er sich an einer Stelle für die ganze App.

**Warum:** SPEC §11 verlangt "ein zentrales Design System", und SPEC
§1 verlangt, dass sich alle 10 Spiele wie eine Anwendung anfühlen, nicht
wie zehn getrennte Minispiele.

---

## 2. Farben

**Einfach erklärt:** Dunkler Hintergrund, wenig aber klar
unterscheidbare Farben, keine Neon-Effekte oder Comic-Optik. Die
Farbwelt lehnt sich an die echte Dartscheibe an (Sisal-Beige, dunkler
Filz, Spinnendraht-Grau) — das haben wir schon im funktionierenden
Prototyp erprobt und wiederverwendet, statt eine neue Farbwelt zu
erfinden. Rot, Grün, Blau und Gold werden NICHT dekorativ eingesetzt,
sondern haben jeweils eine feste Bedeutung (siehe Tabelle), damit man
auf einen Blick weiß, was eine Farbe sagen will.

**Warum:** SPEC §11 fordert Dark-Mode, hohen Kontrast, keine
übermäßigen Neon-Effekte, keine Comic-Optik.

| Token | Bedeutung | Wo verwendet |
|---|---|---|
| `--c-bg` | Seitenhintergrund | ganze App |
| `--c-surface` | Karten, Panels | GameCard, PlayerScoreboard |
| `--c-surface-raised` | Modals, erhöhte Ebenen | DartCorrection, Dialoge |
| `--c-border` / `--c-border-strong` | Trennlinien | Karten-Rahmen |
| `--c-text` / `--c-text-muted` / `--c-text-faint` | Textabstufung | Haupttext / Labels / Meta |
| `--c-accent` (Gold) | aktiver Spieler, Fokus, Highlights | ActivePlayer, Primär-Button |
| `--c-success` (Grün) | Treffer, erfolgreicher Checkout | DartChip, Celebration |
| `--c-danger` (Rot) | Miss, Fehler, Verbindung getrennt | BoardStatus, Fehlermeldung |
| `--c-info` (Blau) | Triple-Hervorhebung | DartChip |

---

## 3. Typografie

**Einfach erklärt:** Es wird die Standard-Schrift des jeweiligen
Geräts verwendet (kein Herunterladen einer Extra-Schrift nötig — das
hält die Anwendung auch bei schlechtem WLAN auf dem Pi schnell). Sehr
wichtig: Zahlen wie der Restscore oder das aktuelle Ziel werden immer
groß dargestellt, damit sie noch aus mehreren Metern Entfernung lesbar
sind, z. B. wenn man gerade zur Scheibe läuft.

**Warum:** SPEC §11 "große Zahlen", SPEC §39 "aus mehreren Metern
Entfernung lesbar".

| Token | Größe | Verwendung |
|---|---|---|
| `--fs-display` | 64–140px (skaliert mit Bildschirmgröße) | Restscore, aktuelles Ziel |
| `--fs-xl` | 40–64px | Spieler-Score im Scoreboard |
| `--fs-lg` | 26–36px | Überschriften, Dart-Werte |
| `--fs-md` | 20px | Standardtext, Buttons |
| `--fs-sm` | 16px | Sekundärlabel (z. B. "Round 8/21") |
| `--fs-xs` | 13px | Meta-Info |

---

## 4. Abstände & Ecken (Spacing & Radius)

**Einfach erklärt:** Alle Abstände zwischen Elementen (Luft zwischen
Buttons, Innenabstand von Karten usw.) kommen aus einer festen Liste
von Werten statt aus Zufallszahlen. Das sorgt dafür, dass alles
gleichmäßig und aufgeräumt wirkt, auch wenn viele verschiedene
Bildschirme entstehen.

**Technisch:** 8px-Raster von `--sp-1` (4px) bis `--sp-8` (64px).
Ecken-Rundung: `--radius-sm` (8px, kleine Elemente) bis `--radius-lg`
(20px, Karten), `--radius-full` für Pillen/Chips.

---

## 5. Touch Targets & Responsive-Regeln

**Einfach erklärt:** Da die Anwendung hauptsächlich per Touch auf
einem Tablet neben der Dartscheibe bedient wird — oft im Stehen, aus
der Bewegung heraus — muss jeder Button groß genug sein, um ihn sicher
zu treffen. Und weil das Gerät mit dem größten Bildschirm (TV/Dart
Display) am wichtigsten ist, wird zuerst für dieses Format entworfen;
kleinere Geräte bekommen ein vereinfachtes, aber nicht das
"eigentliche" Layout.

**Warum:** SPEC §39 — "Große Touch Targets", Prioritätenliste TV vor
Tablet vor Desktop vor Smartphone.

**Technisch:** `--touch-min: 56px` als Mindest-Höhe/Breite für jedes
interaktive Element. Reihenfolge der Layout-Priorität: 16:9 TV/Dart
Display → Tablet Landscape → Desktop → Tablet Portrait → Smartphone.

---

## 6. Cards, Buttons, Scores

**Einfach erklärt:** Diese drei Bausteine tauchen in praktisch jedem
Bildschirm auf und sehen deshalb überall gleich aus: Game Cards für
die Spielauswahl im Hub, Buttons für alle Aktionen, und die
Score-/Dart-Anzeige für den Spielbildschirm. Der wichtige UNDO-Button
ist bewusst NICHT als "gefährlicher" roter Button gestaltet — er wird
oft gebraucht und soll sich nicht wie eine riskante Aktion anfühlen.

**Warum:** SPEC §9/§10 (Game Cards), SPEC §12 (einheitlicher Game
Screen), SPEC §16 (UNDO als zentraler, unaufgeregter Button).

Konkrete Beispiele siehe Styleguide-Vorschau (Abschnitte "Buttons",
"Game Cards", "Scores & Darts").

---

## 7. Player States

**Einfach erklärt:** Der Spieler, der gerade dran ist, muss sofort
auffallen — aber ohne aufdringliche Animation. Dafür bekommt seine
Karte einen goldenen Rahmen und einen ganz leicht helleren
Hintergrund. Wechselt der Spieler, blendet das weich über, statt
abrupt umzuspringen.

**Warum:** SPEC §13 — Accent Border, leichte Hintergrundänderung,
weiche Transition, keine übertriebene Animation.

---

## 8. Statusfarben (Board-Verbindung)

**Einfach erklärt:** Ob die Dartscheibe gerade verbunden ist, wird
nur durch einen kleinen farbigen Punkt angezeigt — grün verbunden,
gold verbindet gerade neu, rot getrennt. Bewusst dezent, damit es
während des Spiels nicht ablenkt.

**Warum:** SPEC §37 — "Dezent anzeigen".

---

## 9. Modals

**Einfach erklärt:** Für Aktionen, die volle Aufmerksamkeit brauchen
— einen Dart korrigieren, oder (neu beschlossen) fragen, ob ein
unterbrochenes Spiel fortgesetzt werden soll — öffnet sich ein Fenster
über dem restlichen Bildschirm. Alle Auswahlmöglichkeiten darin sind
groß genug zum bequemen Antippen.

**Warum:** SPEC §14 (Dart Correction UI), sowie die in
`docs/ARCHITEKTUR.md` Abschnitt 8 festgehaltene Entscheidung zum
Fortsetzen-Dialog nach einem Neustart.

---

## 10. Animationen

**Einfach erklärt:** Animationen sind kurz und leise — ein sanftes
Aufblitzen bei einem Treffer, eine kurze Hervorhebung bei einem Bull
oder Checkout. Sie dürfen den Spielfluss nie aufhalten; man muss nie
auf eine Animation warten, um weiterzuspielen.

**Warum:** SPEC §38 — "Keine Animation darf den Game Flow blockieren."

**Technisch:** Zeit-Tokens `--anim-fast` (120ms, Tap-Feedback),
`--anim-med` (220ms, Zustandswechsel), `--anim-slow` (400ms,
Spielerwechsel-Übergang).

---

## 11. Kiosk-Prinzip

**Einfach erklärt:** Während eines laufenden Spiels sieht die
Anwendung nicht wie eine Website aus — keine Adressleiste-Gefühl,
keine unnötigen Menüs, kein Scrollen. Der Bildschirm zeigt nur, was
gerade zum Spielen gebraucht wird: Ziel, Spieler, Darts.

**Warum:** SPEC §40 — "wie die Oberfläche einer hochwertigen
elektronischen Dart-Anlage".

---

## Wie du dir das Ergebnis ansiehst

1. Öffne den Ordner `docs/design/` im Finder.
2. Doppelklicke auf `styleguide.html` — die Seite öffnet sich direkt
   in deinem Standard-Browser (kein Server, keine Installation nötig).
3. Du siehst Farben, Schriftgrößen, Buttons, Beispiel-Spielkarten,
   Spieler-Zustände, Status-Punkte und ein Beispiel-Korrektur-Fenster.

Falls dir eine Farbe, Schriftgröße oder Stimmung nicht gefällt: das
lässt sich jetzt sehr leicht anpassen, da alles über die Werte in
`docs/design/tokens.css` gesteuert wird — bevor Phase 4 darauf
aufbaut.

---

## Nächster Schritt

Phase 4 gemäß SPEC §42: Profile & Player Selection (Profile anlegen,
Gäste, 1–4 Spieler auswählen, Reihenfolge ändern) — die erste
tatsächliche Bildschirmseite, aufgebaut auf diesem Design-System.
