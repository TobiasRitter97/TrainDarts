// 1:1-Port von backend/persistence/models.py (Phase E des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - Firestore
// statt SQLite, sonst identisches Verhalten.
import { collection, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from "firebase/firestore";
import { Profile } from "../api";
import { currentUid, db, ensureSignedIn } from "./firebase";
import * as guest from "./guestStore";
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

// Soft-Delete: Profil verschwindet aus der Auswahl, alte Matches bleiben gueltig.
export async function archiveProfile(profileId: string): Promise<void> {
  if (guest.isGuest()) return guest.guestArchiveProfile(profileId);
  await updateDoc(doc(await profilesCollection(), profileId), { archived_at: now() });
}
