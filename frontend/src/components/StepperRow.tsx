import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import "./StepperRow.css";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  hint?: string;
};

// Zahlenwert mit festem Bereich - Label links, rechts die Gruppe
// [ − ] [ Wert ] [ + ] (Tobias-Anforderung 17.09.2026).
//
// Der Wert selbst ist ein echtes Eingabefeld: die Knoepfe sind der
// normale Weg, aber bei weiten Bereichen (z.B. Checkout 2-170) waere
// reines Tippen muehsam, deshalb bleibt das direkte Eintippen moeglich.
// Waehrend des Tippens wird der Rohtext gehalten, damit ein kurzzeitig
// leeres Feld nicht sofort auf min zurueckspringt.
export function StepperRow({ label, value, min, max, step = 1, onChange, hint }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  // Wird der Wert von aussen geaendert (Reset beim Spielwechsel), muss
  // ein alter Entwurf verschwinden.
  useEffect(() => setDraft(null), [value]);

  const clamp = (raw: number) => Math.min(max, Math.max(min, raw));
  const atMin = value <= min;
  const atMax = value >= max;

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(parsed)) return; // alten Wert behalten
    onChange(clamp(Math.round(parsed)));
  };

  return (
    <div className="setting-block stepper-block">
      <div className="stepper-head">
        <div className="setting-block-label">{label}</div>
        <div className="stepper" role="group" aria-label={label}>
          <button
            type="button"
            className="stepper-btn"
            aria-label={`${label} verringern`}
            disabled={atMin}
            onClick={() => onChange(clamp(value - step))}
          >
            <Minus size={22} aria-hidden="true" />
          </button>
          <input
            type="number"
            className="stepper-value"
            inputMode="numeric"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={draft ?? value}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button
            type="button"
            className="stepper-btn"
            aria-label={`${label} erhoehen`}
            disabled={atMax}
            onClick={() => onChange(clamp(value + step))}
          >
            <Plus size={22} aria-hidden="true" />
          </button>
        </div>
      </div>
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  );
}
