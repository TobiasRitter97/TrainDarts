// Uebernahme lokaler Gast-Daten in ein frisch angemeldetes Konto
// (Tobias-Anforderung 17.09.2026).
//
// Bewusst ALLES ODER NICHTS: Matches verweisen ueber die Profil-ID auf
// ihre Spieler. Nur die Matches zu uebernehmen ergaebe eine Statistik
// mit unbekannten Namen, nur die Profile eine Statistik ohne Spiele.
//
// Die lokalen Gast-Daten werden dabei NICHT geloescht - erst nach
// ausdruecklicher Freigabe durch Tobias.
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { Profile } from "../api";
import { currentUid, db, ensureSignedIn } from "./firebase";
import { guestListProfiles, guestMatches } from "./guestStore";
import { makeNameUnique } from "./profileNames";

export type TakeoverResult = { profiles: number; matches: number; renamed: { from: string; to: string }[] };

export async function takeOverGuestData(): Promise<TakeoverResult> {
  await ensureSignedIn();
  const uid = currentUid();

  // Archivierte und Gast-Profile mitnehmen: ein Match kann auf sie
  // verweisen, sonst fehlt in der Statistik ploetzlich ein Spieler.
  const profiles = guestListProfiles(true, true);
  const matches = guestMatches().filter((m) => m.status === "finished");

  const profilesRef = collection(db, "users", uid, "profiles");

  // Namenskonflikte mit bereits vorhandenen Konto-Profilen: der
  // eingehende Gast-Spieler wird UMBENANNT (" (2)", " (3)", ...), nicht
  // verworfen und nicht mit dem gleichnamigen Konto-Profil verschmolzen.
  //
  // Begruendung: Spiele verweisen ueber die Profil-ID, nicht ueber den
  // Namen. Verwerfen wuerde die zugehoerigen Spiele namenlos machen,
  // Verschmelzen wuerde fremde Ergebnisse unter einem bestehenden
  // Spieler zusammenwerfen - beides waere ein Datenverlust. Die
  // Profil-ID bleibt in jedem Fall erhalten.
  const taken = (await getDocs(profilesRef)).docs.map((d) => d.data() as Profile);
  const renamed: { from: string; to: string }[] = [];

  for (const profile of profiles) {
    const unique = makeNameUnique(profile.name, taken);
    if (unique !== profile.name) renamed.push({ from: profile.name, to: unique });
    const stored: Profile = { ...profile, name: unique };
    // Die lokal erzeugte UUID wird beibehalten, damit die Verweise aus
    // den Matches unveraendert gueltig bleiben.
    await setDoc(doc(profilesRef, stored.id), stored);
    taken.push(stored);
  }

  const matchesRef = collection(db, "users", uid, "matches");
  for (const match of matches) {
    await setDoc(doc(matchesRef, match.id), match);
  }

  return { profiles: profiles.length, matches: matches.length, renamed };
}
