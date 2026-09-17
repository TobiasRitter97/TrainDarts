// Uebernahme lokaler Gast-Daten in ein frisch angemeldetes Konto
// (Tobias-Anforderung 17.09.2026).
//
// Bewusst ALLES ODER NICHTS: Matches verweisen ueber die Profil-ID auf
// ihre Spieler. Nur die Matches zu uebernehmen ergaebe eine Statistik
// mit unbekannten Namen, nur die Profile eine Statistik ohne Spiele.
//
// Die lokalen Gast-Daten werden dabei NICHT geloescht - erst nach
// ausdruecklicher Freigabe durch Tobias.
import { collection, doc, setDoc } from "firebase/firestore";
import { currentUid, db, ensureSignedIn } from "./firebase";
import { guestListProfiles, guestMatches } from "./guestStore";

export type TakeoverResult = { profiles: number; matches: number };

export async function takeOverGuestData(): Promise<TakeoverResult> {
  await ensureSignedIn();
  const uid = currentUid();

  // Archivierte und Gast-Profile mitnehmen: ein Match kann auf sie
  // verweisen, sonst fehlt in der Statistik ploetzlich ein Spieler.
  const profiles = guestListProfiles(true, true);
  const matches = guestMatches().filter((m) => m.status === "finished");

  const profilesRef = collection(db, "users", uid, "profiles");
  for (const profile of profiles) {
    // Die lokal erzeugte UUID wird beibehalten, damit die Verweise aus
    // den Matches unveraendert gueltig bleiben.
    await setDoc(doc(profilesRef, profile.id), profile);
  }

  const matchesRef = collection(db, "users", uid, "matches");
  for (const match of matches) {
    await setDoc(doc(matchesRef, match.id), match);
  }

  return { profiles: profiles.length, matches: matches.length };
}
