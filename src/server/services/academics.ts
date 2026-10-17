import "server-only";
import type { z } from "zod";
import { splitIntoTerms } from "@/features/classes/domain";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";
import type {
  bellPeriodSchema,
  classSchema,
  classSubjectSchema,
  levelSchema,
  roomSchema,
  subjectSchema,
  termSchema,
  yearSchema,
} from "@/schemas/academics";

function manage(ctx: AppContext) {
  assertCan(ctx, "academics.manage", ["school"]);
}

export async function saveYear(ctx: AppContext, input: z.infer<typeof yearSchema>) {
  manage(ctx);
  const db = ctx.db;
  if (input.is_current) {
    const { error } = await db
      .from("academic_years")
      .update({ is_current: false })
      .eq("school_id", ctx.school.id)
      .eq("is_current", true);
    if (error) throw fromDbError(error);
  }
  if (input.id) {
    unwrap(
      await db
        .from("academic_years")
        .update({ name: input.name, starts_on: input.starts_on, ends_on: input.ends_on, is_current: input.is_current })
        .eq("id", input.id)
        .select("id")
        .single(),
    );
    return input.id;
  }
  const year = unwrap(
    await db
      .from("academic_years")
      .insert({
        school_id: ctx.school.id,
        name: input.name,
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        is_current: input.is_current,
      })
      .select("id")
      .single(),
  );
  const terms = splitIntoTerms(input.starts_on, input.ends_on, input.terms).map((t) => ({
    ...t,
    school_id: ctx.school.id,
    academic_year_id: year.id,
  }));
  const { error } = await db.from("terms").insert(terms);
  if (error) throw fromDbError(error);
  return year.id;
}

export async function updateTerm(ctx: AppContext, input: z.infer<typeof termSchema>) {
  manage(ctx);
  unwrap(
    await ctx.db
      .from("terms")
      .update({ name: input.name, starts_on: input.starts_on, ends_on: input.ends_on, weight: input.weight })
      .eq("id", input.id)
      .eq("school_id", ctx.school.id)
      .select("id")
      .single(),
  );
}

export async function saveLevel(ctx: AppContext, input: z.infer<typeof levelSchema>) {
  manage(ctx);
  let cycleId: string | null = null;
  if (input.cycle_name) {
    const existing = await ctx.db
      .from("cycles")
      .select("id")
      .eq("school_id", ctx.school.id)
      .eq("name", input.cycle_name)
      .maybeSingle();
    cycleId =
      existing.data?.id ??
      unwrap(
        await ctx.db.from("cycles").insert({ school_id: ctx.school.id, name: input.cycle_name }).select("id").single(),
      ).id;
  }
  const row = { name: input.name, short_name: input.short_name || null, position: input.position, cycle_id: cycleId };
  const q = input.id
    ? ctx.db.from("levels").update(row).eq("id", input.id).select("id").single()
    : ctx.db
        .from("levels")
        .insert({ ...row, school_id: ctx.school.id })
        .select("id")
        .single();
  return unwrap(await q).id;
}

export async function saveSubject(ctx: AppContext, input: z.infer<typeof subjectSchema>) {
  manage(ctx);
  const row = { code: input.code, name: input.name, color: input.color ?? null };
  const q = input.id
    ? ctx.db.from("subjects").update(row).eq("id", input.id).select("id").single()
    : ctx.db
        .from("subjects")
        .insert({ ...row, school_id: ctx.school.id })
        .select("id")
        .single();
  return unwrap(await q).id;
}

export async function saveRoom(ctx: AppContext, input: z.infer<typeof roomSchema>) {
  manage(ctx);
  const row = { name: input.name, building: input.building || null, capacity: input.capacity ?? null };
  const q = input.id
    ? ctx.db.from("rooms").update(row).eq("id", input.id).select("id").single()
    : ctx.db
        .from("rooms")
        .insert({ ...row, school_id: ctx.school.id })
        .select("id")
        .single();
  return unwrap(await q).id;
}

export async function saveClass(ctx: AppContext, yearId: string, input: z.infer<typeof classSchema>) {
  manage(ctx);
  const row = {
    name: input.name,
    level_id: input.level_id,
    capacity: input.capacity,
    room_id: input.room_id ?? null,
    homeroom_staff_id: input.homeroom_staff_id ?? null,
  };
  if (input.id) {
    const { count } = await ctx.db
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", input.id)
      .eq("status", "active");
    if ((count ?? 0) > input.capacity)
      throw new AppError("VALIDATION", `La capacité ne peut pas être inférieure à l'effectif actuel (${count}).`);
    return unwrap(await ctx.db.from("classes").update(row).eq("id", input.id).select("id").single()).id;
  }
  return unwrap(
    await ctx.db
      .from("classes")
      .insert({ ...row, school_id: ctx.school.id, academic_year_id: yearId })
      .select("id")
      .single(),
  ).id;
}

export async function deleteClass(ctx: AppContext, id: string) {
  manage(ctx);
  const { count } = await ctx.db.from("enrollments").select("id", { count: "exact", head: true }).eq("class_id", id);
  if ((count ?? 0) > 0) throw new AppError("VALIDATION", "Impossible de supprimer une classe qui a des inscriptions.");
  const { error } = await ctx.db.from("classes").delete().eq("id", id).eq("school_id", ctx.school.id);
  if (error) throw fromDbError(error);
}

export async function saveClassSubject(ctx: AppContext, input: z.infer<typeof classSubjectSchema>) {
  manage(ctx);
  const row = {
    subject_id: input.subject_id,
    teacher_id: input.teacher_id ?? null,
    coefficient: input.coefficient,
    weekly_hours: input.weekly_hours ?? null,
  };
  const q = input.id
    ? ctx.db.from("class_subjects").update(row).eq("id", input.id).eq("class_id", input.class_id).select("id").single()
    : ctx.db
        .from("class_subjects")
        .insert({ ...row, school_id: ctx.school.id, class_id: input.class_id })
        .select("id")
        .single();
  return unwrap(await q).id;
}

export async function deleteClassSubject(ctx: AppContext, id: string) {
  manage(ctx);
  const { count } = await ctx.db
    .from("assessments")
    .select("id", { count: "exact", head: true })
    .eq("class_subject_id", id);
  if ((count ?? 0) > 0)
    throw new AppError("VALIDATION", "Des évaluations existent pour cet enseignement : il ne peut pas être supprimé.");
  const { error } = await ctx.db.from("class_subjects").delete().eq("id", id).eq("school_id", ctx.school.id);
  if (error) throw fromDbError(error);
}

export async function saveBellPeriods(ctx: AppContext, periods: z.infer<typeof bellPeriodSchema>[]) {
  assertCan(ctx, "timetable.manage", ["school"]);
  const { error: delError } = await ctx.db.from("bell_periods").delete().eq("school_id", ctx.school.id);
  if (delError) throw fromDbError(delError);
  if (!periods.length) return;
  const { error } = await ctx.db
    .from("bell_periods")
    .insert(periods.map((p, i) => ({ ...p, school_id: ctx.school.id, position: i + 1 })));
  if (error) throw fromDbError(error);
}

export async function academicReferenceData(ctx: AppContext) {
  const db = ctx.db;
  const s = ctx.school.id;
  const [years, levels, subjects, rooms, staff, periods] = await Promise.all([
    db
      .from("academic_years")
      .select("id, name, starts_on, ends_on, is_current, status, terms(id, name, position, starts_on, ends_on, weight)")
      .eq("school_id", s)
      .order("starts_on", { ascending: false }),
    db
      .from("levels")
      .select("id, name, short_name, position, cycle:cycles!levels_school_id_cycle_id_fkey(name)")
      .eq("school_id", s)
      .order("position"),
    db.from("subjects").select("id, code, name, color, is_active").eq("school_id", s).order("name"),
    db.from("rooms").select("id, name, building, capacity").eq("school_id", s).order("name"),
    db
      .from("staff_members")
      .select("id, first_name, last_name, is_teacher, job_title")
      .eq("school_id", s)
      .neq("status", "archived")
      .order("last_name"),
    db
      .from("bell_periods")
      .select("id, label, starts_at, ends_at, is_break, position")
      .eq("school_id", s)
      .order("position"),
  ]);
  return {
    years: unwrapList(years),
    levels: unwrapList(levels),
    subjects: unwrapList(subjects),
    rooms: unwrapList(rooms),
    staff: unwrapList(staff),
    periods: unwrapList(periods),
  };
}

export async function classesOverview(ctx: AppContext, yearId: string) {
  const db = ctx.db;
  const [classes, enrollments, assignments, contracts] = await Promise.all([
    db
      .from("classes")
      .select(
        "id, name, capacity, level:levels!classes_school_id_level_id_fkey(id, name, position), room:rooms!classes_school_id_room_id_fkey(name), homeroom:staff_members!classes_school_id_homeroom_staff_id_fkey(id, first_name, last_name)",
      )
      .eq("school_id", ctx.school.id)
      .eq("academic_year_id", yearId)
      .order("name"),
    db.from("enrollments").select("class_id").eq("academic_year_id", yearId).eq("status", "active"),
    db
      .from("class_subjects")
      .select("teacher_id, weekly_hours, class:classes!class_subjects_school_id_class_id_fkey!inner(academic_year_id)")
      .eq("school_id", ctx.school.id)
      .eq("class.academic_year_id", yearId),
    db.from("staff_contracts").select("staff_id, weekly_hours").eq("school_id", ctx.school.id).eq("status", "active"),
  ]);
  const counts = new Map<string, number>();
  for (const e of enrollments.data ?? []) if (e.class_id) counts.set(e.class_id, (counts.get(e.class_id) ?? 0) + 1);
  return {
    classes: unwrapList(classes)
      .map((c) => ({ ...c, enrolled: counts.get(c.id) ?? 0 }))
      .sort((a, b) => (a.level?.position ?? 0) - (b.level?.position ?? 0) || a.name.localeCompare(b.name)),
    assignments: (assignments.data ?? []).map((a) => ({
      teacher_id: a.teacher_id,
      weekly_hours: a.weekly_hours === null ? null : Number(a.weekly_hours),
    })),
    contractHours: new Map(
      (contracts.data ?? []).filter((c) => c.weekly_hours !== null).map((c) => [c.staff_id, Number(c.weekly_hours)]),
    ),
  };
}

export async function getClassDetail(ctx: AppContext, id: string) {
  const db = ctx.db;
  const { data: cls, error } = await db
    .from("classes")
    .select(
      "id, name, capacity, academic_year_id, level_id, room_id, homeroom_staff_id, level:levels!classes_school_id_level_id_fkey(name), room:rooms!classes_school_id_room_id_fkey(name), homeroom:staff_members!classes_school_id_homeroom_staff_id_fkey(first_name, last_name), year:academic_years!classes_school_id_academic_year_id_fkey(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!cls) throw new AppError("NOT_FOUND");
  const [roster, subjects] = await Promise.all([
    db
      .from("enrollments")
      .select(
        "id, enrolled_on, student:students!enrollments_school_id_student_id_fkey(id, matricule, first_name, last_name, gender, birth_date)",
      )
      .eq("class_id", id)
      .eq("status", "active"),
    db
      .from("class_subjects")
      .select(
        "id, coefficient, weekly_hours, subject_id, teacher_id, subject:subjects!class_subjects_school_id_subject_id_fkey(name, code, color), teacher:staff_members!class_subjects_school_id_teacher_id_fkey(id, first_name, last_name)",
      )
      .eq("class_id", id),
  ]);
  return {
    cls,
    roster: (roster.data ?? [])
      .filter((r) => r.student)
      .sort((a, b) => a.student!.last_name.localeCompare(b.student!.last_name)),
    subjects: (subjects.data ?? []).sort((a, b) => (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "")),
  };
}
