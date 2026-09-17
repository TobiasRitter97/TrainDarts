import { SettingField } from "../api";
import { targetAverage } from "../engine/families/x01";
import { SegmentedControl, SegmentOption } from "./SegmentedControl";
import { StepperRow } from "./StepperRow";
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

// Der anzuzeigende Erklaerungstext. Hat die AKTIVE Option einen eigenen
// Hint, ersetzt dieser den allgemeinen Feld-Hint - so zeigt z.B.
// "Safehouse" nur die Erklaerung der gerade gewaehlten Option
// (Tobias-Feedback 11.09.2026), nicht alle drei auf einmal.
function hintFor(field: SettingField, values: Record<string, unknown>): string | undefined {
  const activeOption = field.options?.find((opt) => values[field.key] === opt.value);
  return computedHintText(field, values) ?? activeOption?.hint ?? field.hint;
}

// Rendert die Game Settings rein aus dem settingsSchema der
// GameDefinition (SPEC §32) - keine eigene Setup-Seite pro Spiel.
//
// Seit dem Setup-Redesign (17.09.2026) gibt es dafuer genau zwei
// Bausteine: SegmentedControl fuer jede Auswahl aus festen Optionen
// (inklusive der Ja/Nein-Schalter, die vorher eigene Toggle-Knoepfe
// waren) und StepperRow fuer jeden Zahlenwert. Die uebergebenen Werte
// aendern sich dadurch nicht - nur die Eingabeart.
export function GameSettingsForm({ schema, values, onChange }: Props) {
  return (
    <div className="settings-form">
      {visibleSettings(schema, values).map((field) => {
        const hint = hintFor(field, values);

        if (field.type === "number") {
          return (
            <StepperRow
              key={field.key}
              label={field.label}
              value={Number(values[field.key] ?? field.default ?? field.min ?? 0)}
              min={field.min ?? 0}
              max={field.max ?? 999}
              onChange={(value) => onChange(field.key, value)}
              hint={hint}
            />
          );
        }

        if (field.type === "toggle") {
          return (
            <SegmentedControl
              key={field.key}
              label={field.label}
              options={[
                { value: false, label: "Off", quiet: true },
                { value: true, label: "On" },
              ]}
              value={Boolean(values[field.key])}
              onChange={(value) => onChange(field.key, value)}
              hint={hint}
            />
          );
        }

        return (
          <SegmentedControl
            key={field.key}
            label={field.label}
            options={(field.options ?? []) as SegmentOption[]}
            value={values[field.key]}
            multi={field.type === "multiselect"}
            onChange={(value) => onChange(field.key, value)}
            hint={hint}
          />
        );
      })}
    </div>
  );
}
