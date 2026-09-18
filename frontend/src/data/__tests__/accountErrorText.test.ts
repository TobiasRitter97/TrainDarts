import { describe, expect, it } from "vitest";
import { accountErrorText } from "../firebase";

// Fehlertexte fuer das Loeschen des Kontos
// (screens/ProfileScreen.tsx -> data/profiles.ts deleteAccount()).
// Der wichtige Fall ist "auth/requires-recent-login": deleteAccount()
// loescht IMMER zuerst die Firestore-Daten und ruft erst danach
// deleteUser() auf, ein Fehler an dieser Stelle bedeutet also, dass
// die Daten schon weg sind - der Text muss das sagen, nicht einen
// generischen Fehler zeigen, der eine unveraenderte Ausgangslage
// suggeriert.
describe("accountErrorText", () => {
  it("erklaert bei einer noetigen erneuten Anmeldung, dass die Daten bereits geloescht sind", () => {
    const text = accountErrorText({ code: "auth/requires-recent-login" });
    expect(text).toMatch(/data has been deleted/i);
    expect(text).toMatch(/sign in again/i);
  });

  it("meldet einen Netzwerkfehler als solchen, ohne den Loeschstand zu behaupten", () => {
    const text = accountErrorText({ code: "auth/network-request-failed" });
    expect(text).toMatch(/internet connection/i);
    expect(text).not.toMatch(/has been deleted/i);
  });

  it("verweist bei jedem anderen Fehler auf die manuelle Loeschung per E-Mail", () => {
    expect(accountErrorText({ code: "auth/internal-error" })).toContain("tobi.ritter@web.de");
    expect(accountErrorText(new Error("irgendwas"))).toContain("tobi.ritter@web.de");
    expect(accountErrorText("kein Fehlerobjekt")).toContain("tobi.ritter@web.de");
  });
});
