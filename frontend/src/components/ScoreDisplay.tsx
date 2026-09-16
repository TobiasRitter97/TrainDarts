import "./ScoreDisplay.css";

type Props = {
  label: string;
  value: string | number;
  size?: "lg" | "md";
};

// Wiederverwendbarer "grosses Label + grosser Wert"-Block (Redesign
// 16.09.2026, Tobias' Referenzbild 2) - z.B. fuer TARGET, den eigenen
// Rest bei Random Checkout, o.ae. Ersetzt die bisher direkt in
// GameScreenView.tsx wiederholten .target-label/.target-value-Paare.
export function ScoreDisplay({ label, value, size = "lg" }: Props) {
  return (
    <div className={`score-display ${size}`}>
      <div className="score-display-label">{label}</div>
      <div className="score-display-value">{value}</div>
    </div>
  );
}
