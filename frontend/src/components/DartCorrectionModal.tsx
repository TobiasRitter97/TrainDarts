import { useState } from "react";
import { DartboardPicker, Segment } from "./DartboardPicker";
import "./DartCorrectionModal.css";

type Props = {
  title: string;
  onSelect: (segment: Segment) => void;
  onClose: () => void;
};

const NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

// Zentrale Korrektur-UI (SPEC §14) - dieselbe Komponente fuer
// Dart-Korrektur UND + DART (SPEC §15). DartboardPicker ist der
// primaere Weg, die Segment/Zahl-Auswahl bleibt als Fallback
// (docs/ARCHITEKTUR.md Abschnitt 7.1).
export function DartCorrectionModal({ title, onSelect, onClose }: Props) {
  const [fallbackType, setFallbackType] = useState<"S" | "D" | "T" | null>(null);

  function selectFallbackNumber(n: number) {
    const multiplier = { S: 1, D: 2, T: 3 }[fallbackType ?? "S"];
    onSelect({ number: n, multiplier });
    setFallbackType(null);
  }

  return (
    <div className="dart-correction-overlay" onClick={onClose}>
      <div className="dart-correction-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dart-correction-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            ✕
          </button>
        </div>

        <DartboardPicker onSelect={onSelect} />

        <div className="dart-correction-quick">
          <button className="btn-outline" onClick={() => onSelect({ number: 0, multiplier: 0 })}>
            MISS
          </button>
          <button className="btn-outline" onClick={() => onSelect({ number: 0, multiplier: 0 })}>
            BOUNCER
          </button>
        </div>

        <details className="dart-correction-fallback">
          <summary>Fallback: Segment + Zahl</summary>
          <div className="segment-grid">
            <button
              className={`btn-secondary ${fallbackType === "S" ? "active" : ""}`}
              onClick={() => setFallbackType("S")}
            >
              SINGLE
            </button>
            <button
              className={`btn-secondary ${fallbackType === "D" ? "active" : ""}`}
              onClick={() => setFallbackType("D")}
            >
              DOUBLE
            </button>
            <button
              className={`btn-secondary ${fallbackType === "T" ? "active" : ""}`}
              onClick={() => setFallbackType("T")}
            >
              TRIPLE
            </button>
          </div>
          {fallbackType && (
            <div className="number-grid">
              {NUMBERS.map((n) => (
                <button key={n} className="btn-outline" onClick={() => selectFallbackNumber(n)}>
                  {n}
                </button>
              ))}
              {fallbackType === "S" && (
                <button className="btn-outline" onClick={() => onSelect({ number: 25, multiplier: 1 })}>
                  OUTER BULL
                </button>
              )}
              {fallbackType === "D" && (
                <button className="btn-outline" onClick={() => onSelect({ number: 25, multiplier: 2 })}>
                  BULL
                </button>
              )}
            </div>
          )}
        </details>
      </div>
    </div>
  );
}
