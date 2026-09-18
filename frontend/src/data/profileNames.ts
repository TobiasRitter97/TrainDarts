// Namensregeln fuer Spielerprofile (Tobias-Anforderung 18.09.2026).
//
// Eine Quelle fuer beide Welten: Firestore-Profile (data/profiles.ts)
// und Gast-Profile im localStorage (data/guestStore.ts) pruefen gegen
// dieselben Regeln. Eindeutig muss ein Name jeweils nur INNERHALB
// seines Bereichs sein - ein Konto fuer sich, der Gast-Speicher fuer
// sich. Es gibt keinen kontenuebergreifenden Index.
import { Profile } from "../api";

export const NAME_MIN = 2;
export const NAME_MAX = 24;

// Buchstaben (jede Schrift, also auch Umlaute und Akzente), Ziffern,
// Leerzeichen und die ueblichen Namenszeichen. Bewusst ohne Zeichen,
// die in einer Namensliste nur verwirren (Klammern sind erlaubt, weil
// die Gast-Uebernahme damit Konflikte aufloest).
const ALLOWED = /^[\p{L}\p{N} '._()-]+$/u;

// Fuer die ANZEIGE: nur aussen gekuerzt, innen bleibt alles so, wie es
// getippt wurde.
export function displayName(raw: string): string {
  return raw.trim();
}

// Fuer den VERGLEICH: aussen gekuerzt, innere Leerraumfolgen auf ein
// Leerzeichen zusammengezogen, kleingeschrieben. "Tobias  R" und
// "tobias r" gelten damit als derselbe Name.
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

// Wird geworfen, wenn ein Name nicht zulaessig oder schon vergeben ist.
// Eigener Typ, damit die Oberflaeche ihn von einem Netzwerkfehler
// unterscheiden kann.
export class ProfileNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileNameError";
  }
}

// Prueft Laenge und Zeichen. Gibt den zu speichernden Namen zurueck
// oder wirft. Leerraum am Rand fuehrt nicht zu einem Fehler, er wird
// entfernt - alles andere waere unnoetig streng.
export function validateName(raw: string): string {
  const name = displayName(raw);
  if (name.length === 0) throw new ProfileNameError("Please enter a name.");
  if (name.length < NAME_MIN) throw new ProfileNameError(`The name needs at least ${NAME_MIN} characters.`);
  if (name.length > NAME_MAX) throw new ProfileNameError(`The name can be at most ${NAME_MAX} characters long.`);
  if (!ALLOWED.test(name)) {
    throw new ProfileNameError("The name may only contain letters, digits, spaces and the characters ' . _ - ( )");
  }
  return name;
}

// Ist das derselbe Name wie bisher (nur anders geschrieben)? Damit
// laesst sich das unveraenderte Speichern vom echten Umbenennen
// unterscheiden.
export function isSameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

// Ist der Name innerhalb dieser Profilliste noch frei? Das eigene
// Profil zaehlt dabei nicht als Konflikt - ein Profil auf seinen
// eigenen Namen umzubenennen (oder unveraendert zu speichern) muss
// immer gehen, auch wenn es schon laenger einen Namensgleichen gibt.
export function findNameConflict(
  name: string,
  existing: Pick<Profile, "id" | "name">[],
  ownProfileId?: string
): Pick<Profile, "id" | "name"> | null {
  const wanted = normalizeName(name);
  return existing.find((p) => p.id !== ownProfileId && normalizeName(p.name) === wanted) ?? null;
}

export function assertNameFree(
  name: string,
  existing: Pick<Profile, "id" | "name">[],
  ownProfileId?: string
): void {
  const clash = findNameConflict(name, existing, ownProfileId);
  if (clash) throw new ProfileNameError(`There is already a profile called “${clash.name}”. Pick another name.`);
}

// Haengt " (2)", " (3)" usw. an, bis der Name frei ist.
//
// NUR fuer die Uebernahme von Gast-Daten in ein Konto
// (data/guestTakeover.ts) - also genau dort, wo niemand gefragt werden
// kann und der eingehende Name trotzdem nicht verworfen werden darf,
// weil Spiele ueber die Profil-ID darauf verweisen. Ueberall sonst,
// wo jemand am Bildschirm sitzt, wird ein belegter Name gemeldet
// statt still entschaerft.
export function makeNameUnique(name: string, existing: Pick<Profile, "id" | "name">[]): string {
  const base = displayName(name);
  if (!findNameConflict(base, existing)) return base;
  for (let suffix = 2; suffix < 100; suffix++) {
    const marker = ` (${suffix})`;
    // Basis notfalls kuerzen, damit die Gesamtlaenge im Rahmen bleibt.
    const trimmed = base.slice(0, Math.max(NAME_MIN, NAME_MAX - marker.length)).trim();
    const candidate = `${trimmed}${marker}`;
    if (!findNameConflict(candidate, existing)) return candidate;
  }
  // Praktisch unerreichbar - dann lieber eindeutig als schoen.
  return `${base.slice(0, 10).trim()} ${Date.now().toString().slice(-6)}`;
}
