import { SettingField } from "../api";
import { targetAverage } from "../engine/families/x01";
import "./GameSettingsForm.css";

type Props = {
  schema: SettingField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

// Welche Felder aktuell ueberhaupt sichtbar sind (showIf). Wird auch vom
// Setup-Screen gebraucht, um nur SICHTBARE Zahlenfelder zu pruefen -
// ein ausgeblendetes Feld darf den Start nie blockieren.
export function visibleSettings(schema: SettingField[], values: Record<string, unknown>): SettingField[] {
  return schema.filter((field) => {
    if (!field.showIf) return true;
    const { key, equals } = field.showIf;
    return Array.isArray(equals) ? equals.includes(values[key]) : values[key] === equals;
  });
}

// Ist der Wert eines sichtbaren Zahlenfelds innerhalb von min/max?
export function settingsAreValid(schema: SettingField[], values: Record<string, unknown>): boolean {
  return visibleSettings(schema, values).every((field) => {
    if (field.type !== "number") return true;
    const value = Number(values[field.key]);
    // Alle Zahlenfelder der Plattform sind Stueckzahlen (Darts, Legs,
    // Sets) - Kommawerte sind ueberall unsinnig.
    if (!Number.isInteger(value)) return false;
    if (field.min !== undefined && value < field.min) return false;
    if (field.max !== undefined && value > field.max) return false;
    return true;
  });
}

// Live berechneter Zusatztext (aendert sich mit der Eingabe, deshalb
// kein statischer "hint").
function computedHintText(field: SettingField, values: Record<string, unknown>): string | null {
  if (field.computedHint !== "pressureTargetAverage") return null;
  const darts = Number(values[field.key]);
  if (!Number.isFinite(darts) || darts <= 0) return null;
  return `Target average: ${targetAverage(501, darts).toFixed(1).replace(".", ",")}`;
}

// Rendert die Game Settings rein aus dem settingsSchema der
// GameDefinition (SPEC §32) - keine eigene Setup-Seite pro Spiel.
export function GameSettingsForm({ schema, values, onChange }: Props) {
  return (
    <div className="settings-form">
      {visibleSettings(schema, values).map((field) => {
        // Hat die aktive Option einen eigenen Hint, ersetzt dieser den
        // allgemeinen Feld-Hint - so zeigt z.B. "Safehouse" nur die
        // Erklaerung der gerade gewaehlten Option (Standard/Easy/Off),
        // nicht alle drei auf einmal (Tobias-Feedback 11.09.2026).
        const activeOption = field.options?.find((opt) => values[field.key] === opt.value);
        const hint = computedHintText(field, values) ?? activeOption?.hint ?? field.hint;
        return (
        <div key={field.key} className="settings-row">
          <label className="settings-label">{field.label}</label>

          {field.type === "toggle" && (
            <button
              type="button"
              className={`toggle-btn ${values[field.key] ? "on" : ""}`}
              onClick={() => onChange(field.key, !values[field.key])}
            >
              {values[field.key] ? "ON" : "OFF"}
            </button>
          )}

          {field.type === "select" && (
            <div className="option-row">
              {field.options?.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`option-btn ${values[field.key] === opt.value ? "active" : ""}`}
                  onClick={() => onChange(field.key, opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {field.type === "multiselect" && (
            <div className="option-row">
              {field.options?.map((opt) => {
                const selected = Array.isArray(values[field.key]) ? (values[field.key] as (string | number)[]) : [];
                const active = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`option-btn ${active ? "active" : ""}`}
                    onClick={() => {
                      // Mindestens eine Option muss aktiv bleiben - das
                      // Abwaehlen der letzten wird bewusst ignoriert.
                      if (active && selected.length === 1) return;
                      onChange(field.key, active ? selected.filter((v) => v !== opt.value) : [...selected, opt.value]);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {field.type === "number" && (
            <div className="option-row">
              {field.presets?.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`option-btn ${values[field.key] === preset ? "active" : ""}`}
                  onClick={() => onChange(field.key, preset)}
                >
                  {preset}
                </button>
              ))}
              <input
                type="number"
                className="number-input"
                min={field.min}
                max={field.max}
                value={Number(values[field.key] as number)}
                onChange={(e) => onChange(field.key, Number(e.target.value))}
              />
            </div>
          )}

          {hint && <p className="settings-hint">{hint}</p>}
        </div>
        );
      })}
    </div>
  );
}
