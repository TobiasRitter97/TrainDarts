import { LucideIcon } from "lucide-react";
import "./StatCard.css";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string | number;
};

// Kleine Statistik-Kachel (Redesign 16.09.2026, Tobias' Referenzbild 2:
// "Game Stats"-Tab mit Attempts/Hit Rate/Best usw.).
export function StatCard({ icon: Icon, label, value }: Props) {
  return (
    <div className="stat-card">
      <Icon size={18} strokeWidth={2} className="stat-card-icon" />
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
