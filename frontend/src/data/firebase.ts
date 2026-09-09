// Firebase-Anbindung (Phase E des Client-Rewrites, siehe
// ~/.claude/plans/agile-brewing-wadler.md). Ersetzt das alte Python-
// Backend + SQLite fuer Profile/Match-Historie/Statistiken/
// Bestenlisten - kein eigener Server mehr noetig.
//
// Jede Installation (Browser) bekommt automatisch eine anonyme
// Firebase-Identitaet (kein sichtbarer Login), analog zur bisherigen
// Isolation "jeder Pi hat nur seine eigenen Daten" - alle Daten liegen
// unter users/{uid}/... und sind nur fuer diese Identitaet sichtbar
// (siehe Firestore-Regeln in docs/DEPLOY.md). Bekannte Einschraenkung:
// die anonyme Identitaet ist an DIESEN Browser/DIESES Geraet gebunden -
// ein Wechsel des Geraets/Browsers startet mit leeren Profilen, genau
// wie bisher ein Wechsel des Pis.
//
// Der apiKey unten ist bewusst kein Geheimnis - Firebase-Web-API-Keys
// sind oeffentlich, die eigentliche Absicherung passiert ueber die
// Firestore-Sicherheitsregeln (nur der eigene uid-Pfad ist lesbar/
// schreibbar), nicht ueber ein verstecktes Passwort.
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCcvmvIwu_pV-Ojng2QLLyPI6qvfzs2dD0",
  authDomain: "traindarts.firebaseapp.com",
  projectId: "traindarts",
  storageBucket: "traindarts.firebasestorage.app",
  messagingSenderId: "670103117013",
  appId: "1:670103117013:web:ee42c1fd3e698526f7565c",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
// Realtime Database (Phase F, Online-Multiplayer): fuer den EPHEMEREN
// Raum-Zustand waehrend einer laufenden Online-Partie besser geeignet
// als Firestore (einfachere Echtzeit-Listener, kein Index-Aufwand fuer
// den simplen "ganzer Raum aendert sich"-Anwendungsfall). Dauerhafte
// Daten (Profile/Statistiken) bleiben in Firestore (siehe profiles.ts/
// matches.ts/stats.ts).
//
// Explizite databaseURL noetig: die Datenbank wurde in europe-west1
// angelegt, ohne diese URL versucht das SDK die (falsche) Standard-
// US-Region zu erraten und Schreibzugriffe haengen dann unbemerkt.
export const rtdb = getDatabase(app, "https://traindarts-default-rtdb.europe-west1.firebasedatabase.app");

let readyPromise: Promise<User> | null = null;

// Muss vor jedem Firestore-Zugriff abgewartet werden (einmal pro
// Seitenaufruf) - danach ist auth.currentUser garantiert gesetzt.
export function ensureSignedIn(): Promise<User> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
        }
      },
      reject
    );
    signInAnonymously(auth).catch(reject);
  });
  return readyPromise;
}

export function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Noch nicht bei Firebase angemeldet - ensureSignedIn() zuerst abwarten.");
  }
  return uid;
}
