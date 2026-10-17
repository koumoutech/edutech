import "server-only";
import { z } from "zod";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { findConflicts, type Slot } from "@/features/timetable/domain";
import { fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrapList } from "@/server/errors";
import { getCurrentYear } from "@/server/repositories/academic";

export const entrySchema = z.object({
  class_subject_id: z.uuid("Enseignement requis"),
  weekday: z.coerce.number().int().min(1).max(7),
  starts_at: z.string().regex(/^\d{2}:\d{2}$/),
  ends_at: z.string().regex(/^\d{2}:\d{2}$/),
  room_id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  teacher_id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const substitutionSchema = z.object({
  timetable_entry_id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  substitute_teacher_id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  is_cancelled: z.literal("on").optional(),
  reason: z.string().trim().max(300).optional(),
});

const ENTRY_SELECT =
  "id, weekday, starts_at, ends_at, class_id, teacher_id, room_id, class_subject_id, class:classes!timetable_entries_school_id_class_id_fkey(name), cs:class_subjects!timetable_entries_school_id_class_subject_id_fkey(subject:subjects!class_subjects_school_id_subject_id_fkey(name, color, code)), teacher:staff_members!timetable_entries_school_id_teacher_id_fkey(first_name, last_name), room:rooms!timetable_entries_school_id_room_id_fkey(name)";

export type TimetableView = { kind: "class" | "teacher" | "room"; id: string };

/** Resolves the default view for the user (own class for families, own schedule for teachers). */
export async function defaultView(ctx: AppContext): Promise<TimetableView | null> {
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  if (!year) return null;
  if (isFamilyOnly(ctx.school.roles)) {
    const { data } = await ctx.db
      .from("enrollments")
      .select("class_id")
      .eq("academic_year_id", year.id)
      .eq("status", "active")
      .not("class_id", "is", null)
      .limit(1);
    return data?.[0]?.class_id ? { kind: "class", id: data[0].class_id } : null;
  }
  if (ctx.school.staff_id && !canSchoolWide(ctx, "timetable.manage")) {
    const { count } = await ctx.db
      .from("timetable_entries")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", ctx.school.staff_id);
    if (count) return { kind: "teacher", id: ctx.school.staff_id };
  }
  const { data } = await ctx.db.from("classes").select("id").eq("academic_year_id", year.id).order("name").limit(1);
  return data?.[0] ? { kind: "class", id: data[0].id } : null;
}

export async function weekTimetable(ctx: AppContext, view: TimetableView) {
  assertCan(ctx, "timetable.read");
  const col = view.kind === "class" ? "class_id" : view.kind === "teacher" ? "teacher_id" : "room_id";
  const [entries, periods, subs] = await Promise.all([
    ctx.db.from("timetable_entries").select(ENTRY_SELECT).eq(col, view.id).order("weekday").order("starts_at"),
    ctx.db
      .from("bell_periods")
      .select("label, starts_at, ends_at, is_break, position")
      .eq("school_id", ctx.school.id)
      .order("position"),
    ctx.db
      .from("timetable_substitutions")
      .select(
        "id, date, is_cancelled, reason, timetable_entry_id, substitute:staff_members!timetable_substitutions_school_id_substitute_teacher_id_fkey(first_name, last_name)",
      )
      .eq("school_id", ctx.school.id)
      .gte("date", new Date().toISOString().slice(0, 10))
      .order("date")
      .limit(50),
  ]);
  const rows = unwrapList(entries);
  const ids = new Set(rows.map((r) => r.id));
  return {
    entries: rows,
    periods: periods.data ?? [],
    substitutions: (subs.data ?? []).filter((s) => ids.has(s.timetable_entry_id)),
  };
}

export async function timetableOptions(ctx: AppContext) {
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  if (!year) return { classes: [], teachers: [], rooms: [], classSubjects: [] };
  const [classes, teachers, rooms, cs] = await Promise.all([
    ctx.db.from("classes").select("id, name").eq("academic_year_id", year.id).order("name"),
    ctx.db
      .from("staff_members")
      .select("id, first_name, last_name")
      .eq("school_id", ctx.school.id)
      .eq("is_teacher", true)
      .neq("status", "archived")
      .order("last_name"),
    ctx.db.from("rooms").select("id, name").eq("school_id", ctx.school.id).eq("is_active", true).order("name"),
    can(ctx, "timetable.manage")
      ? ctx.db
          .from("class_subjects")
          .select(
            "id, class_id, teacher_id, class:classes!class_subjects_school_id_class_id_fkey!inner(name, academic_year_id), subject:subjects!class_subjects_school_id_subject_id_fkey(name)",
          )
          .eq("class.academic_year_id", year.id)
      : null,
  ]);
  return {
    classes: classes.data ?? [],
    teachers: (teachers.data ?? []).map((t) => ({ id: t.id, name: fullName(t) })),
    rooms: rooms.data ?? [],
    classSubjects: (cs?.data ?? []).map((c) => ({
      id: c.id,
      classId: c.class_id,
      teacherId: c.teacher_id,
      label: `${c.class?.name} — ${c.subject?.name}`,
    })),
  };
}

export async function addEntry(ctx: AppContext, input: z.infer<typeof entrySchema>) {
  assertCan(ctx, "timetable.manage", ["school"]);
  const { data: cs } = await ctx.db
    .from("class_subjects")
    .select("class_id, teacher_id")
    .eq("id", input.class_subject_id)
    .maybeSingle();
  if (!cs) throw new AppError("NOT_FOUND");
  const candidate: Slot = {
    weekday: input.weekday,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    class_id: cs.class_id,
    teacher_id: input.teacher_id ?? cs.teacher_id,
    room_id: input.room_id ?? null,
  };
  // Explicit pre-check for a precise message; the exclusion constraints remain the final guarantee.
  const ors = [`class_id.eq.${candidate.class_id}`];
  if (candidate.teacher_id) ors.push(`teacher_id.eq.${candidate.teacher_id}`);
  if (candidate.room_id) ors.push(`room_id.eq.${candidate.room_id}`);
  const { data: sameDay } = await ctx.db
    .from("timetable_entries")
    .select("id, weekday, starts_at, ends_at, class_id, teacher_id, room_id")
    .eq("school_id", ctx.school.id)
    .eq("weekday", input.weekday)
    .or(ors.join(","));
  const conflicts = findConflicts(candidate, sameDay ?? []);
  if (conflicts.length) throw new AppError("TIMETABLE_CONFLICT", conflicts.map((c) => c.message).join(" "));
  const { error } = await ctx.db.from("timetable_entries").insert({
    school_id: ctx.school.id,
    class_subject_id: input.class_subject_id,
    class_id: candidate.class_id,
    teacher_id: candidate.teacher_id,
    room_id: candidate.room_id,
    weekday: input.weekday,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
  });
  if (error) throw fromDbError(error);
}

export async function deleteEntry(ctx: AppContext, id: string) {
  assertCan(ctx, "timetable.manage", ["school"]);
  const { error } = await ctx.db.from("timetable_entries").delete().eq("id", id).eq("school_id", ctx.school.id);
  if (error) throw fromDbError(error);
}

export async function addSubstitution(ctx: AppContext, input: z.infer<typeof substitutionSchema>) {
  assertCan(ctx, "timetable.manage", ["school"]);
  const cancelled = Boolean(input.is_cancelled);
  const { error } = await ctx.db.from("timetable_substitutions").upsert(
    {
      school_id: ctx.school.id,
      timetable_entry_id: input.timetable_entry_id,
      date: input.date,
      substitute_teacher_id: cancelled ? null : (input.substitute_teacher_id ?? null),
      is_cancelled: cancelled,
      reason: input.reason ?? null,
      created_by: ctx.user.id,
    },
    { onConflict: "timetable_entry_id,date" },
  );
  if (error) throw fromDbError(error);
  const title = cancelled ? `Cours annulé le ${input.date}` : `Remplacement le ${input.date}`;
  await ctx.db.rpc("notify_timetable_change", {
    p_entry: input.timetable_entry_id,
    p_title: title,
    p_body: input.reason,
  });
}
