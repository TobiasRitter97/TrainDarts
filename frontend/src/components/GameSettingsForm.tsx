import { SettingField } from "../api";
import "./GameSettingsForm.css";

type Props = {
  schema: SettingField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

// Rendert die Game Settings rein aus dem settingsSchema der
// GameDefinition (SPEC §32) - keine eigene Setup-Seite pro Spiel.
export function GameSettingsForm({ schema, values, onChange }: Props) {
  function isVisible(field: SettingField): boolean {
    if (!field.showIf) return true;
    const { key, equals } = field.showIf;
    return Array.isArray(equals) ? equals.includes(values[key]) : values[key] === equals;
  }

  return (
    <div className="settings-form">
      {schema.filter(isVisible).map((field) => {
        // Hat die aktive Option einen eigenen Hint, ersetzt dieser den
        // allgemeinen Feld-Hint - so zeigt z.B. "Safehouse" nur die
        // Erklaerung der gerade gewaehlten Option (Standard/Easy/Off),
        // nicht alle drei auf einmal (Tobias-Feedback 11.09.2026).
        const activeOption = field.options?.find((opt) => values[field.key] === opt.value);
        const hint = activeOption?.hint ?? field.hint;
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
