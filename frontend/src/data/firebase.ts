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
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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

// Ein angemeldeter Nutzer im Sinne der App. Eine wiederhergestellte
// ANONYME Sitzung aus der Zeit vor dem Login zaehlt bewusst nicht -
// sie wird nur noch fuer den einmaligen Hinweis beim ersten Start
// ausgewertet (siehe legacyAnonymousUser()).
export function signedInUser(): User | null {
  return currentUser && !currentUser.isAnonymous ? currentUser : null;
}

// Die alte anonyme Sitzung, falls der Browser sie noch hat. Ihre Daten
// werden NICHT uebernommen und NICHT geloescht - sie bleiben unter der
// alten UID in Firestore liegen.
export function legacyAnonymousUser(): User | null {
  return currentUser?.isAnonymous ? currentUser : null;
}

// Muss vor jedem Firestore-Zugriff abgewartet werden. Meldet sich
// NICHT mehr von selbst an - die Screens liegen hinter dem Login.
export function ensureSignedIn(): Promise<User> {
  const user = signedInUser();
  if (user) return Promise.resolve(user);
  return authReady().then((resolved) => {
    if (resolved && !resolved.isAnonymous) return resolved;
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
// Angezeigt werden lesbare Saetze, keine Fehlercodes. Die Oberflaeche
// der Plattform ist durchgehend englisch (Tobias-Vorgabe), deshalb
// auch diese Texte.
const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-email": "That does not look like a valid email address.",
  "auth/missing-email": "Please enter your email address.",
  "auth/missing-password": "Please enter a password.",
  "auth/email-already-in-use": "There is already an account for this email address. Sign in instead.",
  "auth/weak-password": "That password is too short — it needs at least 6 characters.",
  "auth/invalid-credential": "Email address or password is not correct.",
  "auth/wrong-password": "Email address or password is not correct.",
  "auth/user-not-found": "There is no account for this email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a moment, then try again.",
  "auth/network-request-failed": "No connection to the server. Check your internet connection.",
  "auth/operation-not-allowed": "Email sign-in is not enabled in the Firebase project.",
};

export function authErrorText(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  return AUTH_ERRORS[code] ?? "That did not work. Please try again.";
}

// Bewusst OHNE linkWithCredential: eine noch vorhandene anonyme
// Sitzung wird vorher beendet, damit ein frisches Konto mit eigener
// UID entsteht (Tobias-Entscheidung 17.09.2026). Die alten Daten
// bleiben unangetastet unter der alten UID liegen.
export async function registerWithEmail(email: string, password: string): Promise<User> {
  if (auth.currentUser?.isAnonymous) await signOut(auth);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  if (auth.currentUser?.isAnonymous) await signOut(auth);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}
