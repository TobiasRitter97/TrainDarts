import { useEffect, useId, useRef, useState } from "react";
import "./DartboardPicker.css";

export type Segment = { number: number; multiplier: number };

type Props = {
  onSelect: (segment: Segment) => void;
};

const NUM_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const CX = 200;
const CY = 200;
const R = { bull: 6.35, outerBull: 16, tripleIn: 99, tripleOut: 107, doubleIn: 162, doubleOut: 170, label: 185, edge: 196 };
const NS = "http://www.w3.org/2000/svg";

function polar(r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function sectorPath(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x1, y1] = polar(rOut, a0);
  const [x2, y2] = polar(rOut, a1);
  const [x3, y3] = polar(rIn, a1);
  const [x4, y4] = polar(rIn, a0);
  return (
    `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOut} ${rOut} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
    `L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rIn} ${rIn} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`
  );
}

export function labelToSegment(label: string): Segment {
  if (label === "MISS") return { number: 0, multiplier: 0 };
  if (label === "BULL") return { number: 25, multiplier: 2 };
  if (label === "S25") return { number: 25, multiplier: 1 };
  const prefix = label[0];
  const mult = ({ S: 1, D: 2, T: 3 } as Record<string, number>)[prefix] ?? 0;
  return { number: parseInt(label.slice(1), 10), multiplier: mult };
}

// Antippbares Dartboard fuer Korrektur und + DART (docs/ARCHITEKTUR.md
// Abschnitt 7.1). Erprobtes Verhalten aus docs/design/styleguide.html
// portiert: Lupe beim Halten, Bestaetigung vor Uebernahme.
export function DartboardPicker({ onSelect }: Props) {
  const uid = useId().replace(/[:]/g, "");
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const magSvgRef = useRef<SVGSVGElement>(null);
  const magnifierRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<SVGElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [confirmLabel, setConfirmLabel] = useState<string | null>(null);

  useEffect(() => {
    const svgMain = svgRef.current;
    const magSvg = magSvgRef.current;
    const stage = stageRef.current;
    const magnifier = magnifierRef.current;
    const confirmBox = confirmRef.current;
    if (!svgMain || !magSvg || !stage || !magnifier || !confirmBox) return;

    function addSector(parent: SVGGElement, rIn: number, rOut: number, a0: number, a1: number, fill: string, label: string) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", sectorPath(rIn, rOut, a0, a1));
      p.style.fill = fill;
      p.setAttribute("class", "board-segment");
      p.dataset.label = label;
      parent.appendChild(p);
    }

    const rootId = `dartboard-root-${uid}`;
    const root = document.createElementNS(NS, "g");
    root.setAttribute("id", rootId);

    const bg = document.createElementNS(NS, "circle");
    bg.setAttribute("cx", String(CX));
    bg.setAttribute("cy", String(CY));
    bg.setAttribute("r", String(R.edge));
    bg.style.fill = "var(--c-surface)";
    bg.style.stroke = "var(--c-border-strong)";
    bg.style.strokeWidth = "2";
    bg.setAttribute("class", "board-segment");
    bg.dataset.label = "MISS";
    root.appendChild(bg);

    NUM_ORDER.forEach((num, i) => {
      const a0 = -9 + i * 18;
      const a1 = 9 + i * 18;
      const even = i % 2 === 0;
      const singleFill = even ? "var(--c-surface)" : "var(--c-text)";
      const ringFill = even ? "var(--c-danger)" : "var(--c-success)";

      addSector(root, R.outerBull, R.tripleIn, a0, a1, singleFill, `S${num}`);
      addSector(root, R.tripleIn, R.tripleOut, a0, a1, ringFill, `T${num}`);
      addSector(root, R.tripleOut, R.doubleIn, a0, a1, singleFill, `S${num}`);
      addSector(root, R.doubleIn, R.doubleOut, a0, a1, ringFill, `D${num}`);

      const [lx, ly] = polar(R.label, i * 18);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", lx.toFixed(2));
      t.setAttribute("y", ly.toFixed(2));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("class", "board-number-label");
      t.textContent = String(num);
      root.appendChild(t);
    });

    const outerBull = document.createElementNS(NS, "circle");
    outerBull.setAttribute("cx", String(CX));
    outerBull.setAttribute("cy", String(CY));
    outerBull.setAttribute("r", String(R.outerBull));
    outerBull.style.fill = "var(--c-success)";
    outerBull.setAttribute("class", "board-segment");
    outerBull.dataset.label = "S25";
    root.appendChild(outerBull);

    const bullseye = document.createElementNS(NS, "circle");
    bullseye.setAttribute("cx", String(CX));
    bullseye.setAttribute("cy", String(CY));
    bullseye.setAttribute("r", String(R.bull));
    bullseye.style.fill = "var(--c-danger)";
    bullseye.setAttribute("class", "board-segment");
    bullseye.dataset.label = "BULL";
    root.appendChild(bullseye);

    svgMain.appendChild(root);

    const magUse = document.createElementNS(NS, "use");
    magUse.setAttribute("href", `#${rootId}`);
    magSvg.appendChild(magUse);

    function svgPoint(clientX: number, clientY: number) {
      const pt = svgMain!.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svgMain!.getScreenCTM();
      if (!ctm) return { x: CX, y: CY };
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    function setActive(seg: SVGElement | null) {
      if (activeSegmentRef.current && activeSegmentRef.current !== seg) {
        activeSegmentRef.current.classList.remove("active-hit");
      }
      activeSegmentRef.current = seg;
      if (seg) seg.classList.add("active-hit");
    }

    function updateFromPoint(clientX: number, clientY: number) {
      const target = document.elementFromPoint(clientX, clientY);
      const seg = target instanceof SVGElement && target.classList.contains("board-segment") ? target : null;
      setActive(seg);

      const stageRect = stage!.getBoundingClientRect();
      magnifier!.style.left = clientX - stageRect.left + "px";
      magnifier!.style.top = clientY - stageRect.top + "px";
      magnifier!.style.display = "block";

      const p = svgPoint(clientX, clientY);
      const Z = 32;
      magSvg!.setAttribute("viewBox", `${(p.x - Z).toFixed(1)} ${(p.y - Z).toFixed(1)} ${Z * 2} ${Z * 2}`);
    }

    function showConfirm(clientX: number, clientY: number, seg: SVGElement) {
      const stageRect = stage!.getBoundingClientRect();
      let x = clientX - stageRect.left;
      let y = clientY - stageRect.top;
      x = Math.min(Math.max(x, 95), stageRect.width - 95);
      y = Math.min(Math.max(y, 45), stageRect.height - 15);
      confirmBox!.style.left = x + "px";
      confirmBox!.style.top = y + "px";
      confirmBox!.style.display = "block";
      setConfirmLabel(seg.dataset.label ?? null);
    }

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerIdRef.current) return;
      updateFromPoint(e.clientX, e.clientY);
    }
    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerIdRef.current) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      magnifier!.style.display = "none";
      if (activeSegmentRef.current) showConfirm(e.clientX, e.clientY, activeSegmentRef.current);
    }
    function onDown(e: PointerEvent) {
      e.preventDefault();
      pointerIdRef.current = e.pointerId;
      svgMain!.setPointerCapture(e.pointerId);
      confirmBox!.style.display = "none";
      updateFromPoint(e.clientX, e.clientY);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    svgMain.addEventListener("pointerdown", onDown);
    return () => {
      svgMain.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [uid]);

  function hideConfirm() {
    if (confirmRef.current) confirmRef.current.style.display = "none";
    if (activeSegmentRef.current) {
      activeSegmentRef.current.classList.remove("active-hit");
      activeSegmentRef.current = null;
    }
    setConfirmLabel(null);
  }

  function handleYes() {
    if (confirmLabel) onSelect(labelToSegment(confirmLabel));
    hideConfirm();
  }

  return (
    <div className="dartboard-stage" ref={stageRef}>
      <svg ref={svgRef} className="dartboard-svg" viewBox="0 0 400 400" />
      <div className="dart-magnifier" ref={magnifierRef}>
        <svg ref={magSvgRef} viewBox="0 0 400 400" />
        <div className="dart-magnifier-crosshair" />
      </div>
      <div className="dart-confirm" ref={confirmRef}>
        <div className="label">{confirmLabel}</div>
        <div className="q">übernehmen?</div>
        <div className="row">
          <button type="button" className="btn-primary" onClick={handleYes}>
            Übernehmen
          </button>
          <button type="button" className="btn-secondary" onClick={hideConfirm}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
