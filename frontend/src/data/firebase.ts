// Firebase-Anbindung. Ersetzt seit Phase E des Client-Rewrites das alte
// Python-Backend + SQLite fuer Profile/Match-Historie/Statistiken/
// Bestenlisten - kein eigener Server mehr noetig.
//
// Seit 17.09.2026 (Tobias-Anforderung) meldet sich die App mit einem
// echten E-Mail-Konto an statt anonym. Damit haengen Profile und
// Matches nicht mehr am Browser, sondern am Konto: Cache loeschen,
// Inkognito-Fenster oder ein anderes Geraet zeigen nach dem Login
// dieselben Daten.
//
// Die Sitzung wird lokal gehalten (Firebase-Standard). Ein
// Internetausfall meldet also NICHT ab - am Board kann weitergespielt
// werden, auch wenn Firestore gerade nicht erreichbar ist.
import { initializeApp } from "firebase/app";
import {
  type ActionCodeSettings,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// Alle Werte kommen aus der .env (Vorlage: .env.example). Der
// Web-API-Key ist bewusst kein Geheimnis - Firebase-Web-Keys sind
// oeffentlich, abgesichert wird ueber die Firestore-Regeln. Die
// Verlagerung ist Aufraeumarbeit, damit projektspezifische Werte nicht
// im Quelltext stehen.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Fehlt die .env (lokal) bzw. sind die Environment Variables im
// Deployment nicht gesetzt, backt Vite "undefined" ins Bundle und
// Firebase scheitert spaeter mit einer kryptischen Meldung. Hier wird
// das bewusst NICHT geworfen - ein Fehler beim Laden dieses Moduls
// wuerde die ganze App als weisse Seite enden lassen. Stattdessen
// meldet App.tsx den Zustand als lesbaren Hinweis.
const missingConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfigError: string | null =
  missingConfigKeys.length > 0
    ? `Firebase configuration incomplete: ${missingConfigKeys.join(", ")} missing. Locally this means frontend/.env is absent (template: .env.example); in a deployment the environment variables are not set.`
    : null;

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Muss VOR dem ersten Mailversand gesetzt sein: Firebase verschickt die
// Bestaetigungsmail dann auf Deutsch. Betrifft nur die von Firebase
// gehostete Mail, nicht die (englische) Oberflaeche.
auth.languageCode = "de";

// Wohin die Bestaetigungsmail zurueckfuehrt - die eigene Login-Route.
// handleCodeInApp bleibt false: die Bestaetigung selbst erledigt die von
// Firebase gehostete Seite, wir bekommen den Nutzer nur zurueck.
function actionCodeSettings(): ActionCodeSettings {
  return {
    url: import.meta.env.VITE_AUTH_ACTION_URL || window.location.origin,
    handleCodeInApp: false,
  };
}

// Realtime Database (Phase F, Online-Multiplayer): fuer den EPHEMEREN
// Raum-Zustand waehrend einer laufenden Online-Partie besser geeignet
// als Firestore. Dauerhafte Daten (Profile/Statistiken) bleiben in
// Firestore (siehe profiles.ts/matches.ts/gameStats.ts).
export const rtdb = getDatabase(app, import.meta.env.VITE_FIREBASE_DATABASE_URL);

// ---------------------------------------------------------------- Sitzung

let currentUser: User | null = null;
let firstCheckDone = false;
const firstCheckWaiters: (() => void)[] = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!firstCheckDone) {
    firstCheckDone = true;
    firstCheckWaiters.splice(0).forEach((resolve) => resolve());
  }
});

// Wartet einmalig darauf, dass Firebase eine eventuell gespeicherte
// Sitzung wiederhergestellt hat. Danach steht fest, ob jemand
// angemeldet ist - ohne dass hier von sich aus angemeldet wuerde.
export function authReady(): Promise<User | null> {
  if (firstCheckDone) return Promise.resolve(currentUser);
  return new Promise((resolve) => {
    firstCheckWaiters.push(() => resolve(currentUser));
  });
}

export function observeAuth(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, listener);
}

// Ein angemeldeter Nutzer im Sinne der App. Drei Faelle zaehlen
// bewusst NICHT: kein Nutzer, eine wiederhergestellte ANONYME Sitzung
// aus der Zeit vor dem Login, und - seit dem Sicherheits-Update
// 18.09.2026 - ein Konto mit unbestaetigter E-Mail-Adresse. Dadurch
// kann zwischen Anmeldung und Pruefung nie App-Inhalt erscheinen.
export function signedInUser(): User | null {
  if (!currentUser || currentUser.isAnonymous) return null;
  return currentUser.emailVerified ? currentUser : null;
}

// Die alte anonyme Sitzung, falls der Browser sie noch hat. Ihre Daten
// werden NICHT uebernommen und NICHT geloescht - sie bleiben unter der
// alten UID in Firestore liegen.
export function legacyAnonymousUser(): User | null {
  return currentUser?.isAnonymous ? currentUser : null;
}

// Angemeldet, aber E-Mail-Adresse noch nicht bestaetigt. Genau dieser
// Zustand fuehrt auf den Warte-Bildschirm - die Sitzung bleibt dabei
// bewusst bestehen (siehe Kopf dieser Datei), damit "erneut senden"
// und "ich habe bestaetigt" ein User-Objekt haben und kein Passwort
// irgendwo aufbewahrt werden muss.
export function unverifiedUser(): User | null {
  if (!currentUser || currentUser.isAnonymous) return null;
  return currentUser.emailVerified ? null : currentUser;
}

// Muss vor jedem Firestore-Zugriff abgewartet werden. Meldet sich
// NICHT von selbst an - die Screens liegen hinter dem Login.
//
// Die Pruefung laeuft in BEIDEN Zweigen ueber signedInUser(): der
// Fallback hatte die Bestaetigung der Adresse vorher nicht geprueft
// und haette eine unbestaetigte Sitzung durchgelassen.
export function ensureSignedIn(): Promise<User> {
  const user = signedInUser();
  if (user) return Promise.resolve(user);
  return authReady().then(() => {
    const resolved = signedInUser();
    if (resolved) return resolved;
    throw new Error("Not signed in.");
  });
}

export function currentUid(): string {
  const user = signedInUser();
  if (!user) throw new Error("Not signed in - Firestore access without an account is not possible.");
  return user.uid;
}

// ---------------------------------------------------------------- An-/Abmelden

// Firebase liefert technische Codes wie "auth/invalid-credential".
// Sicherheits-Update 18.09.2026: beim ANMELDEN bekommen alle
// zugangsbezogenen Fehler denselben Text. Ein Angreifer soll nicht
// unterscheiden koennen, ob eine Adresse existiert - genau das
// verraeten getrennte Meldungen wie "kein Konto zu dieser Adresse".
//
// Eigene Texte gibt es nur, wo nichts ueber ein Konto verraten wird:
// Zu-viele-Versuche und Netzwerkfehler (so vorgegeben), beim
// REGISTRIEREN zusaetzlich ein zu kurzes Passwort - sonst koennte
// niemand ein Konto anlegen, ohne den Grund zu erfahren.
const NEUTRAL_CREDENTIAL_ERROR = "Email or password is incorrect.";

const SHARED_ERRORS: Record<string, string> = {
  "auth/too-many-requests": "Too many attempts. Wait a moment, then try again.",
  "auth/network-request-failed": "No connection to the server. Check your internet connection.",
};

const REGISTER_ERRORS: Record<string, string> = {
  ...SHARED_ERRORS,
  "auth/weak-password": "That password is too short — it needs at least 6 characters.",
  "auth/invalid-email": "That does not look like a valid email address.",
  "auth/operation-not-allowed": "Email sign-in is not enabled in the Firebase project.",
};

export function authErrorText(error: unknown, context: "login" | "register" = "login"): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  const table = context === "register" ? REGISTER_ERRORS : SHARED_ERRORS;
  return table[code] ?? (context === "register" ? "That did not work. Please try again." : NEUTRAL_CREDENTIAL_ERROR);
}

// ---------------------------------------------------------------- Registrierung

export type RegisterOutcome = "verification_sent";

// Legt ein Konto an und verschickt die Bestaetigungsmail. Die Sitzung
// bleibt danach BESTEHEN - sie ist wertlos, solange die Adresse
// unbestaetigt ist: signedInUser() liefert null, die App zeigt nur den
// Warte-Bildschirm, und die Firestore-Regeln verlangen
// email_verified. Dadurch braucht der Warte-Bildschirm kein Passwort
// mehr, um erneut senden oder nachpruefen zu koennen.
//
// Ist die Adresse bereits vergeben, wird NICHTS angelegt, es entsteht
// keine Sitzung - und trotzdem wird dasselbe Ergebnis gemeldet wie bei
// Erfolg. Sonst waere die Registrierung ein Werkzeug, um vorhandene
// Adressen abzufragen.
export async function registerWithEmail(email: string, password: string): Promise<RegisterOutcome> {
  if (auth.currentUser) await signOut(auth);
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await sendEmailVerification(credential.user, actionCodeSettings());
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code !== "auth/email-already-in-use") {
      if (auth.currentUser) await signOut(auth);
      throw err;
    }
  }
  return "verification_sent";
}

// ---------------------------------------------------------------- Anmeldung

export type LoginOutcome = { status: "ok" } | { status: "unverified" };

// Meldet an und prueft SOFORT, ob die Adresse bestaetigt ist. Ist sie
// es nicht, bleibt die Sitzung bestehen und der Aufrufer leitet auf den
// Warte-Bildschirm. App-Inhalt kann dabei nicht erscheinen, weil
// signedInUser() eine unbestaetigte Sitzung als "nicht angemeldet"
// behandelt.
export async function loginWithEmail(email: string, password: string): Promise<LoginOutcome> {
  if (auth.currentUser) await signOut(auth);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user.emailVerified ? { status: "ok" } : { status: "unverified" };
}

// Verschickt die Bestaetigungsmail erneut - fuer die laufende,
// unbestaetigte Sitzung. Ohne Sitzung (das passiert nur, wenn die
// Adresse bereits vergeben war) passiert bewusst nichts: der
// Bildschirm muss in beiden Faellen gleich aussehen.
export async function resendVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.emailVerified) return;
  await sendEmailVerification(user, actionCodeSettings());
}

// "Ich habe bestaetigt": emailVerified steckt im ID-Token und wird bis
// zu einer Stunde zwischengespeichert. Ohne reload() und erzwungenen
// Token-Neubezug bliebe der Nutzer nach dem Klick in der Mail
// ausgesperrt.
export async function refreshVerification(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  await user.getIdToken(true);
  return Boolean(auth.currentUser?.emailVerified);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
