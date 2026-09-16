import type { CSSProperties } from "react";
import { LucideIcon } from "lucide-react";
import "./SectionHeader.css";

type Props = {
  title: string;
  subline?: string;
  icon?: LucideIcon;
  colorVar?: string;
  viewAllCount?: number;
  onViewAll?: () => void;
};

// Wiederverwendbarer Abschnitts-Kopf (Redesign 16.09.2026) - fuer
// "Recently Played" und jede Kategorie im Game Hub. Ersetzt den
// bisherigen reinen ".section-title" (siehe shared.css) um Subline und
// optionales "View all" ergaenzt, ohne die bestehende Klasse fuer
// andere Screens (Setup/Profile) zu veraendern.
export function SectionHeader({ title, subline, icon: Icon, colorVar, viewAllCount, onViewAll }: Props) {
  return (
    <div className="section-header-row" style={colorVar ? ({ "--section-color": colorVar } as CSSProperties) : undefined}>
      <div className="section-header-main">
        {Icon && (
          <span className="section-header-icon">
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
        <div>
          <h2 className="section-header-title">{title}</h2>
          {subline && <p className="section-header-subline">{subline}</p>}
        </div>
      </div>
      {onViewAll && (
        <button type="button" className="section-header-viewall" onClick={onViewAll}>
          View all{viewAllCount !== undefined ? ` (${viewAllCount})` : ""}
        </button>
      )}
    </div>
  );
}
