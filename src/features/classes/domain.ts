/** Organisation checks (pure): class load and teacher workload. */

export interface ClassLoad {
  id: string;
  name: string;
  capacity: number;
  enrolled: number;
}

export type LoadStatus = "ok" | "near_full" | "full" | "over";

export function classLoadStatus(c: ClassLoad): LoadStatus {
  if (c.enrolled > c.capacity) return "over";
  if (c.enrolled === c.capacity) return "full";
  if (c.enrolled >= Math.ceil(c.capacity * 0.9)) return "near_full";
  return "ok";
}

export interface TeacherAssignment {
  teacher_id: string | null;
  weekly_hours: number | null;
}

/**
 * Teachers whose assigned weekly hours exceed their contract (or the default maximum).
 * Returns teacher id -> { assigned, max }.
 */
export function teacherOverloads(
  assignments: TeacherAssignment[],
  contractHours: Map<string, number>,
  defaultMax = 24,
): Map<string, { assigned: number; max: number }> {
  const totals = new Map<string, number>();
  for (const a of assignments) {
    if (!a.teacher_id) continue;
    totals.set(a.teacher_id, (totals.get(a.teacher_id) ?? 0) + (a.weekly_hours ?? 0));
  }
  const out = new Map<string, { assigned: number; max: number }>();
  for (const [id, assigned] of totals) {
    const max = contractHours.get(id) ?? defaultMax;
    if (assigned > max) out.set(id, { assigned, max });
  }
  return out;
}

/** Splits a school year into N consecutive terms of (roughly) equal length. */
export function splitIntoTerms(startsOn: string, endsOn: string, count: number): { name: string; position: number; starts_on: string; ends_on: string }[] {
  const start = new Date(`${startsOn}T12:00:00Z`).getTime();
  const end = new Date(`${endsOn}T12:00:00Z`).getTime();
  const day = 86_400_000;
  const totalDays = Math.round((end - start) / day) + 1;
  const names = count === 2 ? ["1er semestre", "2e semestre"] : Array.from({ length: count }, (_, i) => (i === 0 ? "1er trimestre" : `${i + 1}e trimestre`));
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return names.map((name, i) => {
    const s = start + Math.floor((totalDays * i) / count) * day;
    const e = i === count - 1 ? end : start + (Math.floor((totalDays * (i + 1)) / count) - 1) * day;
    return { name, position: i + 1, starts_on: iso(s), ends_on: iso(e) };
  });
}
