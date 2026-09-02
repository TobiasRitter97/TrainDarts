import "./CheckoutRouteDisplay.css";

type Props = {
  route: string[] | null;
};

// CheckoutRoute (docs/ARCHITEKTUR.md Abschnitt 4.1): empfohlener
// Finish-Weg, deutlich zurueckhaltender als der Restscore. Wird nach
// jedem Dart neu vom Backend berechnet; kein Vorschlag = kein Finish
// mit den verbleibenden Darts moeglich.
export function CheckoutRouteDisplay({ route }: Props) {
  if (!route || route.length === 0) return null;
  return (
    <div className="checkout-route">
      <span className="checkout-route-label">CHECKOUT</span>
      <span className="checkout-route-path">{route.join("  ·  ")}</span>
    </div>
  );
}
