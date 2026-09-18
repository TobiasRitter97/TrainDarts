// Minimalstes Routing fuer die eine Seite, die eine echte, teilbare
// URL braucht: /privacy. Der Rest der App kennt keine URLs, nur
// internen View-State (App.tsx) - dafuer extra einen Router
// einzufuehren waere fuer eine einzelne statische Seite unnoetig
// schwer. Ein <a href="/privacy"> loest einen echten
// Seitenaufruf aus; vercel.json sorgt dafuer, dass Vercel dafuer
// weiterhin index.html ausliefert statt 404.
import { useEffect, useState } from "react";

export function usePathname(): string {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return pathname;
}
