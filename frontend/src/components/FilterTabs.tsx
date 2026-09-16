import type { CSSProperties } from "react";
import { LucideIcon } from "lucide-react";
import "./FilterTabs.css";

export type FilterTab = { value: string; label: string; icon: LucideIcon; colorVar?: string };

type Props = {
  tabs: FilterTab[];
  value: string;
  onChange: (value: string) => void;
};

// Segment-Tabs fuer den Game-Hub-Filter (Redesign 16.09.2026) - ersetzt
// den bisherigen impliziten "alles auf einer Seite"-Aufbau. Farbe pro
// Tab optional ueber "colorVar" (Kategorie-Akzent), damit z.B. der
// aktive "Checkout"-Tab in Gold statt im generischen Markenakzent
// erscheint.
export function FilterTabs({ tabs, value, onChange }: Props) {
  return (
    <div className="filter-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`filter-tab ${active ? "active" : ""}`}
            style={tab.colorVar ? ({ "--tab-color": tab.colorVar } as CSSProperties) : undefined}
            onClick={() => onChange(tab.value)}
          >
            <Icon size={18} strokeWidth={2} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
