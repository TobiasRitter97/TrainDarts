import "./SegmentedControl.css";

export type SegmentOption = {
  value: string | number | boolean;
  label: string;
  // "quiet" markiert eine Option, die zwar gewaehlt sein kann, aber
  // keine Hervorhebung verdient - konkret das "Off" der Ja/Nein-
  // Schalter. Sonst leuchtete auf jedem Setup-Screen ein goldenes
  // "Off" staerker als die eigentlichen Werte daneben.
  quiet?: boolean;
};

type Props = {
  label: string;
  options: SegmentOption[];
  // Bei multi=false genau ein Wert, bei multi=true eine Liste.
  value: unknown;
  onChange: (value: unknown) => void;
  // Mehrfachauswahl (Random Segment Training: Zielpool). Die letzte
  // aktive Option laesst sich bewusst nicht abwaehlen.
  multi?: boolean;
  hint?: string;
};

// Eine Auswahl aus sich gegenseitig ausschliessenden Optionen - Label
// ueber der Zeile, darunter gleich breite Segmente in einem gemeinsamen
// Rahmen (Tobias-Anforderung 17.09.2026: alle Setup-Screens sollen
// dieselben zwei Bausteine verwenden).
//
// Bis zu vier Optionen stehen in EINER Zeile zu gleichen Teilen. Ab
// fuenf Optionen - oder bei langen Beschriftungen wie den neun Pressure-
// 501-Leveln - bricht derselbe Baustein in ein Raster um, statt die
// Segmente unlesbar schmal zu quetschen. Optik und Bedienung bleiben
// identisch, nur die Anordnung passt sich an.
export function SegmentedControl({ label, options, value, onChange, multi = false, hint }: Props) {
  const selected = multi && Array.isArray(value) ? (value as unknown[]) : [];
  const isActive = (option: SegmentOption) => (multi ? selected.includes(option.value) : value === option.value);

  const handle = (option: SegmentOption) => {
    if (!multi) {
      onChange(option.value);
      return;
    }
    const active = selected.includes(option.value);
    // Mindestens eine Option muss aktiv bleiben.
    if (active && selected.length === 1) return;
    onChange(active ? selected.filter((v) => v !== option.value) : [...selected, option.value]);
  };

  return (
    <div className="setting-block">
      <div className="setting-block-label">{label}</div>
      <div
        className={`segmented ${options.length > 4 ? "segmented-grid" : ""}`}
        role={multi ? "group" : "radiogroup"}
        aria-label={label}
        style={options.length <= 4 ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}
      >
        {options.map((option) => {
          const active = isActive(option);
          return (
            <button
              key={String(option.value)}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={active}
              className={`segment ${active ? "active" : ""} ${option.quiet ? "quiet" : ""}`}
              onClick={() => handle(option)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  );
}
