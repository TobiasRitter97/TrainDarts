import { LucideIcon } from "lucide-react";
import "./ActionIconButton.css";

type Props = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  variant?: "default" | "brand" | "accent";
  disabled?: boolean;
};

// Generischer Icon-Button (Redesign 16.09.2026) - ersetzt einzelne
// Emoji-/Text-Buttons im Header und im Spielbildschirm durch ein
// einheitliches, wiederverwendbares Element. "label" ist Pflicht
// (title-Attribut + aria-label), da es kein sichtbares Textlabel gibt.
export function ActionIconButton({ icon: Icon, label, onClick, active = false, variant = "default", disabled = false }: Props) {
  return (
    <button
      type="button"
      className={`action-icon-btn ${variant} ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon size={20} strokeWidth={2} />
    </button>
  );
}
