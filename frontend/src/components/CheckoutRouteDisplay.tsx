import "./CheckoutRouteDisplay.css";

type Props = {
  route: string[] | null;
};

// CheckoutRoute (docs/ARCHITEKTUR.md Abschnitt 4.1): empfohlener
// Finish-Weg, deutlich zurueckhaltender als der Restscore. Wird nach
// jedem Dart neu berechnet; kein Vorschlag = kein Finish mit den
// verbleibenden Darts moeglich.
//
// Reserviert IMMER denselben Platz (auch ohne Vorschlag), statt bei
// fehlendem Vorschlag komplett zu verschwinden - sonst springt der
// gesamte Screen bei jedem Dart nach oben/unten, je nachdem ob gerade
// ein Checkout moeglich ist oder nicht (Tobias-Feedback 10.09.2026).
export function CheckoutRouteDisplay({ route }: Props) {
  const hasRoute = Boolean(route && route.length > 0);
  return (
    <div className={`checkout-route ${hasRoute ? "" : "checkout-route-empty"}`}>
      <span className="checkout-route-label">CHECKOUT</span>
      <span className="checkout-route-path">{hasRoute ? route!.join("  ·  ") : "—"}</span>
    </div>
  );
}
