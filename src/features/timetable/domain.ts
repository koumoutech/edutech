/** Timetable conflict detection (mirrors the database exclusion constraints, with explicit messages). */

export interface Slot {
  id?: string;
  weekday: number;
  starts_at: string; // HH:MM or HH:MM:SS
  ends_at: string;
  class_id: string;
  teacher_id: string | null;
  room_id: string | null;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function overlaps(
  a: Pick<Slot, "weekday" | "starts_at" | "ends_at">,
  b: Pick<Slot, "weekday" | "starts_at" | "ends_at">,
): boolean {
  return (
    a.weekday === b.weekday &&
    toMinutes(a.starts_at) < toMinutes(b.ends_at) &&
    toMinutes(b.starts_at) < toMinutes(a.ends_at)
  );
}

export type ConflictKind = "class" | "teacher" | "room" | "invalid";

export interface Conflict {
  kind: ConflictKind;
  with?: Slot;
  message: string;
}

export function findConflicts(
  candidate: Slot,
  existing: Slot[],
  names: { classes?: Map<string, string>; teachers?: Map<string, string>; rooms?: Map<string, string> } = {},
): Conflict[] {
  if (toMinutes(candidate.ends_at) <= toMinutes(candidate.starts_at))
    return [{ kind: "invalid", message: "L'heure de fin doit suivre l'heure de début." }];
  if (candidate.weekday < 1 || candidate.weekday > 7) return [{ kind: "invalid", message: "Jour invalide." }];
  const out: Conflict[] = [];
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (!overlaps(candidate, e)) continue;
    const when = `${e.starts_at.slice(0, 5)}–${e.ends_at.slice(0, 5)}`;
    if (e.class_id === candidate.class_id)
      out.push({
        kind: "class",
        with: e,
        message: `La classe ${names.classes?.get(e.class_id) ?? ""} a déjà cours (${when}).`,
      });
    if (candidate.teacher_id && e.teacher_id === candidate.teacher_id)
      out.push({
        kind: "teacher",
        with: e,
        message: `L'enseignant ${names.teachers?.get(e.teacher_id) ?? ""} est déjà occupé (${when}).`,
      });
    if (candidate.room_id && e.room_id === candidate.room_id)
      out.push({
        kind: "room",
        with: e,
        message: `La salle ${names.rooms?.get(e.room_id) ?? ""} est déjà réservée (${when}).`,
      });
  }
  return out;
}

/** Weekly hours scheduled per class subject compared with the planned weekly hours. */
export function scheduledMinutesByKey<T extends { starts_at: string; ends_at: string }>(
  slots: T[],
  key: (s: T) => string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) m.set(key(s), (m.get(key(s)) ?? 0) + toMinutes(s.ends_at) - toMinutes(s.starts_at));
  return m;
}
