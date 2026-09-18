// 1:1-Port von backend/persistence/models.py (Phase E des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - Firestore
// statt SQLite, sonst identisches Verhalten.
import {
  collection,
  doc,
  type DocumentReference,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteUser } from "firebase/auth";
import { Profile } from "../api";
import { auth, currentUid, db, ensureSignedIn } from "./firebase";
import * as guest from "./guestStore";
import { clearLastUsedProfile, getLastUsedProfileId } from "./localPrefs";
import { assertNameFree, isSameName, ProfileNameError, validateName } from "./profileNames";

async function profilesCollection() {
  await ensureSignedIn();
  return collection(db, "users", currentUid(), "profiles");
}

function now(): string {
  return new Date().toISOString();
}

// Im Gast-Modus kommen Profile aus dem localStorage statt aus
// Firestore (siehe guestStore.ts). Die Signaturen bleiben gleich,
// deshalb merken die Aufrufer davon nichts.
export async function listProfiles(includeGuests = false, includeArchived = false): Promise<Profile[]> {
  if (guest.isGuest()) return guest.guestListProfiles(includeGuests, includeArchived);
  const snap = await getDocs(await profilesCollection());
  return snap.docs
    .map((d) => d.data() as Profile)
    .filter((p) => p.merged_into_profile_id === null)
    .filter((p) => includeArchived || p.archived_at === null)
    .filter((p) => includeGuests || !p.is_guest)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getProfile(profileId: string): Promise<Profile | null> {
  if (guest.isGuest()) return guest.guestGetProfile(profileId);
  const snap = await getDoc(doc(await profilesCollection(), profileId));
  return snap.exists() ? (snap.data() as Profile) : null;
}

// Namen sind innerhalb eines Kontos eindeutig (Tobias-Anforderung
// 18.09.2026). Verglichen wird normalisiert (siehe profileNames.ts),
// gespeichert so, wie getippt.
//
// Zur Transaktion: der Firestore-CLIENT kann in einer Transaktion nur
// EINZELNE Dokumente lesen, keine Abfrage ueber eine Sammlung. Die
// Liste wird deshalb vorher gelesen, und die Transaktion holt danach
// jedes dieser Dokumente noch einmal - dadurch sind sie gesperrt und
// die Pruefung kann nicht durch eine gleichzeitige Umbenennung auf
// einem zweiten Geraet veralten. Siehe Zusammenfassung fuer die
// verbleibende Luecke.
export async function createProfile(data: {
  name: string;
  initials?: string;
  color?: string;
  is_guest?: boolean;
}): Promise<Profile> {
  if (guest.isGuest()) return guest.guestCreateProfile(data);
  const name = validateName(data.name);
  const col = await profilesCollection();
  const known = (await getDocs(col)).docs.map((d) => d.id);

  const profile: Profile = {
    id: crypto.randomUUID(),
    name,
    initials: data.initials ?? null,
    color: data.color ?? null,
    is_guest: data.is_guest ? 1 : 0,
    merged_into_profile_id: null,
    archived_at: null,
    created_at: now(),
  };

  await runTransaction(db, async (tx) => {
    const existing: Pick<Profile, "id" | "name">[] = [];
    for (const id of known) {
      const snap = await tx.get(doc(col, id));
      if (snap.exists()) existing.push(snap.data() as Profile);
    }
    assertNameFree(name, existing);
    tx.set(doc(col, profile.id), profile);
  });

  return profile;
}

export async function updateProfile(
  profileId: string,
  data: { name?: string; initials?: string; color?: string }
): Promise<Profile | null> {
  if (guest.isGuest()) return guest.guestUpdateProfile(profileId, data);

  const fields: Partial<Profile> = {};
  if (data.name !== undefined) fields.name = validateName(data.name);
  if (data.initials !== undefined) fields.initials = data.initials;
  if (data.color !== undefined) fields.color = data.color;
  if (Object.keys(fields).length === 0) return getProfile(profileId);

  const col = await profilesCollection();

  // Ohne Namensaenderung ist nichts zu pruefen.
  if (fields.name === undefined) {
    await updateDoc(doc(col, profileId), fields);
    return getProfile(profileId);
  }

  const known = (await getDocs(col)).docs.map((d) => d.id);
  await runTransaction(db, async (tx) => {
    const target = await tx.get(doc(col, profileId));
    if (!target.exists()) throw new ProfileNameError("This profile no longer exists.");
    const current = target.data() as Profile;

    // Bleibt der Name derselbe (auch nur anders geschrieben), wird gar
    // nicht geprueft. Sonst liessen sich Altprofile, die sich schon
    // immer einen Namen teilen, nicht mehr speichern - Bestandsdaten
    // werden ausdruecklich nicht angetastet.
    if (!isSameName(fields.name as string, current.name)) {
      const existing: Pick<Profile, "id" | "name">[] = [];
      for (const id of known) {
        if (id === profileId) continue;
        const snap = await tx.get(doc(col, id));
        if (snap.exists()) existing.push(snap.data() as Profile);
      }
      assertNameFree(fields.name as string, existing, profileId);
    }
    tx.update(doc(col, profileId), fields);
  });

  return getProfile(profileId);
}

// Deaktivieren (kein Loeschen): das Profil verschwindet aus der
// Spielerauswahl, seine Matches und Statistiken bleiben unangetastet.
// Umkehrbar ueber reactivateProfile().
//
// Das LETZTE aktive Profil laesst sich nicht deaktivieren - sonst
// koennte man kein Spiel mehr starten und muesste erst ein neues
// Profil anlegen.
export async function archiveProfile(profileId: string): Promise<void> {
  if (guest.isGuest()) return guest.guestArchiveProfile(profileId);
  const active = await listProfiles(true, false);
  if (active.length <= 1 && active.some((p) => p.id === profileId)) {
    throw new ProfileNameError("This is your last active profile. Create another one before deactivating it.");
  }
  await updateDoc(doc(await profilesCollection(), profileId), { archived_at: now() });
}

export async function reactivateProfile(profileId: string): Promise<void> {
  if (guest.isGuest()) return guest.guestReactivateProfile(profileId);
  await updateDoc(doc(await profilesCollection(), profileId), { archived_at: null });
}


// ---------------------------------------------------------------- Loeschen

// Jede Sammlung unter users/{uid}, deren Dokumente einem Spielerprofil
// zugeordnet sind. deleteProfile() geht AUSSCHLIESSLICH diese Liste
// durch - kommt spaeter eine Sammlung dazu, gehoert sie hier hinein
// und nirgends sonst. Ein Test (data/__tests__/profileDeletion.test.ts)
// schlaegt fehl, wenn eine Sammlung im Code auftaucht, die hier fehlt.
//
// "arrayField": in einem Match steht nicht EIN profileId, sondern die
// Liste aller Beteiligten (playerIds).
export const PROFILE_OWNED_COLLECTIONS = [{ collection: "matches", arrayField: "playerIds" }] as const;

// Die eigene Profil-Sammlung - hier liegt das Profildokument selbst,
// sie ist deshalb bewusst NICHT Teil der Liste oben.
export const PROFILE_COLLECTION = "profiles";

export type DeletionInfo = {
  // Spiele, an denen NUR dieses Profil beteiligt ist - die werden
  // mitgeloescht.
  ownGames: number;
  // Spiele mit weiteren Mitspielern. Die bleiben erhalten: sie gehoeren
  // auch den anderen Beteiligten, und die Reihenfolge in playerIds
  // traegt im Event-Log die Zuordnung jedes Wurfs.
  sharedGames: number;
  // Gesetzt, wenn nicht geloescht werden darf.
  blockedReason: string | null;
};

function unfinishedGameMessage(name: string): string {
  return `'${name}' is part of an unfinished game. Finish or discard it first.`;
}

const LAST_PROFILE_MESSAGE = "This is your last profile. Create another one before deleting it.";

// Was wuerde ein Loeschen bedeuten? Die Oberflaeche fragt das VOR der
// Bestaetigung ab, um die echte Anzahl zu nennen und eine Sperre
// anzuzeigen, statt sie erst beim Klick zu melden.
export async function profileDeletionInfo(profileId: string): Promise<DeletionInfo> {
  if (guest.isGuest()) return guest.guestDeletionInfo(profileId);

  const profile = await getProfile(profileId);
  const all = await listProfiles(true, true);
  const col = await profilesCollection();

  let ownGames = 0;
  let sharedGames = 0;
  let blockedReason: string | null = all.length <= 1 ? LAST_PROFILE_MESSAGE : null;

  for (const entry of PROFILE_OWNED_COLLECTIONS) {
    const ref = collection(col.parent!, entry.collection);
    const snap = await getDocs(query(ref, where(entry.arrayField, "array-contains", profileId)));
    for (const d of snap.docs) {
      const data = d.data() as { playerIds?: string[]; status?: string };
      if (data.status === "in_progress" && blockedReason === null) {
        blockedReason = unfinishedGameMessage(profile?.name ?? "This profile");
      }
      if ((data.playerIds ?? []).length <= 1) ownGames += 1;
      else sharedGames += 1;
    }
  }

  return { ownGames, sharedGames, blockedReason };
}

// Loescht das Profil und alle Dokumente, die AUSSCHLIESSLICH ihm
// gehoeren - in einem Batch, damit kein halber Zustand entstehen kann.
// Dokumente mit weiteren Beteiligten bleiben unangetastet.
export async function deleteProfile(profileId: string): Promise<void> {
  if (guest.isGuest()) return guest.guestDeleteProfile(profileId);

  const info = await profileDeletionInfo(profileId);
  if (info.blockedReason) throw new ProfileNameError(info.blockedReason);

  const col = await profilesCollection();
  const batch = writeBatch(db);

  for (const entry of PROFILE_OWNED_COLLECTIONS) {
    const ref = collection(col.parent!, entry.collection);
    const snap = await getDocs(query(ref, where(entry.arrayField, "array-contains", profileId)));
    for (const d of snap.docs) {
      const data = d.data() as { playerIds?: string[] };
      // Niemals ein Dokument anfassen, an dem noch jemand anderes
      // haengt.
      if ((data.playerIds ?? []).length <= 1) batch.delete(d.ref);
    }
  }

  batch.delete(doc(col, profileId));
  await batch.commit();

  // Die geraetelokale Vorauswahl darf nicht auf ein geloeschtes Profil
  // zeigen.
  if (getLastUsedProfileId() === profileId) clearLastUsedProfile();
}

// ---------------------------------------------------------------- Konto loeschen

// Loescht das GESAMTE Konto: alle eigenen Profile und alle eigenen
// Spiele in Firestore, danach die Firebase-Anmeldung selbst. Anders
// als deleteProfile() gibt es hier keine "aber ein anderer Spieler
// haengt noch daran"-Ausnahme - es geht das ganze Konto weg, also
// darf auch jedes Match darunter verschwinden, geteilt oder nicht.
//
// Sicherheit: jede Abfrage haengt an "users/{uid}" mit der UID der
// eigenen, bestaetigten Sitzung (ensureSignedIn()/currentUid()) - ein
// anderes Konto ist von hier aus technisch nicht erreichbar.
//
// Die Realtime-Database-Raeume (online/roomDb.ts) werden bewusst NICHT
// angefasst: sie sind ohnehin fluechtig (ein Raum loescht sich selbst,
// sobald die Partie endet) und wuerden, waeren sie noch aktiv, auch
// den/die anderen Teilnehmer betreffen - das widerspraeche "keine
// Daten anderer Nutzer aendern".
//
// Reihenfolge wichtig: ERST die Firestore-Daten loeschen, DANN das
// Konto. Schlaegt deleteUser() mit "auth/requires-recent-login" fehl
// (Firebase verlangt fuer diesen Schritt eine kuerzliche Anmeldung),
// sind die gespeicherten Daten trotzdem schon weg - siehe
// accountErrorText() in data/firebase.ts fuer die Nutzermeldung dazu.
export async function deleteAccount(): Promise<void> {
  if (guest.isGuest()) throw new Error("Guest sessions have no account to delete.");

  await ensureSignedIn();
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const userDoc = (await profilesCollection()).parent!; // users/{uid}, aus der eigenen Sitzung
  const collectionsToWipe = [PROFILE_COLLECTION, ...PROFILE_OWNED_COLLECTIONS.map((c) => c.collection)];

  const refs: DocumentReference[] = [];
  for (const name of collectionsToWipe) {
    const snap = await getDocs(collection(userDoc, name));
    refs.push(...snap.docs.map((d) => d.ref));
  }

  // Firestore erlaubt maximal 500 Operationen pro Batch. Fuer ein
  // Hobby-Konto praktisch immer ein einziger Durchlauf, aber auch bei
  // sehr vielen Spielen korrekt.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
    await batch.commit();
  }

  clearLastUsedProfile();
  await deleteUser(user);
}
