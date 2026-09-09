// 1:1-Port von backend/persistence/models.py (Phase E des Client-
// Rewrites, siehe ~/.claude/plans/agile-brewing-wadler.md) - Firestore
// statt SQLite, sonst identisches Verhalten.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { Profile } from "../api";
import { currentUid, db, ensureSignedIn } from "./firebase";

async function profilesCollection() {
  await ensureSignedIn();
  return collection(db, "users", currentUid(), "profiles");
}

function now(): string {
  return new Date().toISOString();
}

export async function listProfiles(includeGuests = false, includeArchived = false): Promise<Profile[]> {
  const snap = await getDocs(await profilesCollection());
  return snap.docs
    .map((d) => d.data() as Profile)
    .filter((p) => p.merged_into_profile_id === null)
    .filter((p) => includeArchived || p.archived_at === null)
    .filter((p) => includeGuests || !p.is_guest)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getProfile(profileId: string): Promise<Profile | null> {
  const snap = await getDoc(doc(await profilesCollection(), profileId));
  return snap.exists() ? (snap.data() as Profile) : null;
}

export async function createProfile(data: {
  name: string;
  initials?: string;
  color?: string;
  is_guest?: boolean;
}): Promise<Profile> {
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: data.name,
    initials: data.initials ?? null,
    color: data.color ?? null,
    is_guest: data.is_guest ? 1 : 0,
    merged_into_profile_id: null,
    archived_at: null,
    created_at: now(),
  };
  await setDoc(doc(await profilesCollection(), profile.id), profile);
  return profile;
}

export async function updateProfile(
  profileId: string,
  data: { name?: string; initials?: string; color?: string }
): Promise<Profile | null> {
  const fields: Partial<Profile> = {};
  if (data.name !== undefined) fields.name = data.name;
  if (data.initials !== undefined) fields.initials = data.initials;
  if (data.color !== undefined) fields.color = data.color;
  if (Object.keys(fields).length > 0) {
    await updateDoc(doc(await profilesCollection(), profileId), fields);
  }
  return getProfile(profileId);
}

// Soft-Delete: Profil verschwindet aus der Auswahl, alte Matches bleiben gueltig.
export async function archiveProfile(profileId: string): Promise<void> {
  await updateDoc(doc(await profilesCollection(), profileId), { archived_at: now() });
}
