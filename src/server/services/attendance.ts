import "server-only";
import { z } from "zod";
import { can, canSchoolWide } from "@/lib/authz";
import { isoDate } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrapList } from "@/server/errors";
import { getCurrentYear, listTeacherAssignments } from "@/server/repositories/academic";

export const attendanceRecordSchema = z.object({
  student_id: z.uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  minutes_late: z.coerce.number().int().min(0).max(600).optional(),
  note: z.string().trim().max(300).optional(),
});

export const saveAttendanceSchema = z.object({
  class_id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timetable_entry_id: z.uuid().optional(),
  records: z.array(attendanceRecordSchema).min(1).max(200),
});

export async function rollCallContext(ctx: AppContext, classId: string, date: string, entryId?: string) {
  assertCan(ctx, "attendance.create");
  const db = ctx.db;
  const { data: cls } = await db.from("classes").select("id, name").eq("id", classId).maybeSingle();
  if (!cls) throw new AppError("NOT_FOUND");
  const [roster, session, entry] = await Promise.all([
    db
      .from("enrollments")
      .select("student:students!enrollments_school_id_student_id_fkey(id, first_name, last_name, matricule)")
      .eq("class_id", classId)
      .eq("status", "active"),
    (() => {
      const q = db
        .from("attendance_sessions")
        .select("id, taken_at, attendance_records(student_id, status, minutes_late, note)")
        .eq("class_id", classId)
        .eq("date", date);
      return (entryId ? q.eq("timetable_entry_id", entryId) : q.is("timetable_entry_id", null)).maybeSingle();
    })(),
    entryId
      ? db
          .from("timetable_entries")
          .select("starts_at, ends_at, cs:class_subjects!timetable_entries_school_id_class_subject_id_fkey(subject:subjects!class_subjects_school_id_subject_id_fkey(name))")
          .eq("id", entryId)
          .maybeSingle()
      : null,
  ]);
  const students = (roster.data ?? [])
    .map((r) => r.student)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  const { data: justified } = await db
    .from("absence_justifications")
    .select("student_id")
    .in("student_id", students.map((s) => s.id))
    .eq("status", "accepted")
    .lte("from_date", date)
    .gte("to_date", date);
  return {
    cls,
    students,
    existing: session.data?.attendance_records ?? [],
    takenAt: session.data?.taken_at ?? null,
    entry: entry?.data ?? null,
    justified: new Set((justified ?? []).map((j) => j.student_id)),
  };
}

export async function saveAttendance(ctx: AppContext, input: z.infer<typeof saveAttendanceSchema>) {
  assertCan(ctx, "attendance.create");
  if (input.date > isoDate()) throw new AppError("FUTURE_DATE");
  const { data, error } = await ctx.db.rpc("save_attendance", {
    p_school: ctx.school.id,
    p_class: input.class_id,
    p_date: input.date,
    p_records: input.records,
    p_timetable_entry: input.timetable_entry_id,
  });
  if (error) throw fromDbError(error);
  return data;
}

/** Classes the user can take attendance for, with today's status. */
export async function attendanceOverview(ctx: AppContext) {
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  if (!year) return { year, classes: [], pendingJustifications: 0 };
  let classes = unwrapList(await ctx.db.from("classes").select("id, name").eq("academic_year_id", year.id).order("name"));
  if (!canSchoolWide(ctx, "attendance.create") && ctx.school.staff_id) {
    const mine = new Set((await listTeacherAssignments(ctx.db, ctx.school.staff_id, year.id)).map((a) => a.class?.id));
    const { data: homeroom } = await ctx.db.from("classes").select("id").eq("homeroom_staff_id", ctx.school.staff_id);
    for (const h of homeroom ?? []) mine.add(h.id);
    classes = classes.filter((c) => mine.has(c.id));
  }
  const ids = classes.map((c) => c.id);
  const [sessions, pending] = await Promise.all([
    ids.length ? ctx.db.from("attendance_sessions").select("class_id, attendance_records(status)").in("class_id", ids).eq("date", isoDate()) : null,
    can(ctx, "justifications.validate")
      ? ctx.db.from("absence_justifications").select("id", { count: "exact", head: true }).eq("school_id", ctx.school.id).eq("status", "pending")
      : null,
  ]);
  const today = new Map<string, { absent: number; late: number; total: number }>();
  for (const s of sessions?.data ?? []) {
    const cur = today.get(s.class_id) ?? { absent: 0, late: 0, total: 0 };
    for (const r of s.attendance_records ?? []) {
      cur.total++;
      if (r.status === "absent") cur.absent++;
      if (r.status === "late") cur.late++;
    }
    today.set(s.class_id, cur);
  }
  return { year, classes: classes.map((c) => ({ ...c, today: today.get(c.id) ?? null })), pendingJustifications: pending?.count ?? 0 };
}

/** History of one student (parents / students / staff), RLS-filtered. */
export async function studentAttendanceHistory(ctx: AppContext, studentId: string) {
  assertCan(ctx, "attendance.read");
  const [records, justifications] = await Promise.all([
    ctx.db
      .from("attendance_records")
      .select("id, status, minutes_late, note, session:attendance_sessions!attendance_records_school_id_session_id_fkey(date, kind, cs:class_subjects!attendance_sessions_school_id_class_subject_id_fkey(subject:subjects!class_subjects_school_id_subject_id_fkey(name)))")
      .eq("student_id", studentId)
      .neq("status", "present")
      .order("created_at", { ascending: false })
      .limit(100),
    ctx.db
      .from("absence_justifications")
      .select("id, from_date, to_date, reason, status, review_comment, submitted_at")
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false })
      .limit(50),
  ]);
  return { records: unwrapList(records), justifications: unwrapList(justifications) };
}

export const justificationSchema = z
  .object({
    student_id: z.uuid(),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(3, "Motif requis").max(1000),
  })
  .refine((v) => v.to_date >= v.from_date, { path: ["to_date"], message: "La date de fin précède le début" });

export async function submitJustification(ctx: AppContext, input: z.infer<typeof justificationSchema>, documentId?: string) {
  assertCan(ctx, "justifications.create");
  const { error } = await ctx.db.from("absence_justifications").insert({
    school_id: ctx.school.id,
    student_id: input.student_id,
    from_date: input.from_date,
    to_date: input.to_date,
    reason: input.reason,
    submitted_by: ctx.user.id,
    document_id: documentId ?? null,
  });
  if (error) throw fromDbError(error);
}

export async function pendingJustifications(ctx: AppContext) {
  assertCan(ctx, "justifications.validate");
  return unwrapList(
    await ctx.db
      .from("absence_justifications")
      .select("id, from_date, to_date, reason, status, submitted_at, document_id, student:students!absence_justifications_school_id_student_id_fkey(id, first_name, last_name)")
      .eq("school_id", ctx.school.id)
      .order("status")
      .order("submitted_at", { ascending: false })
      .limit(100),
  );
}

export async function reviewJustification(ctx: AppContext, id: string, status: "accepted" | "rejected", comment?: string) {
  assertCan(ctx, "justifications.validate");
  const { error } = await ctx.db.rpc("review_absence_justification", { p_id: id, p_status: status, p_comment: comment });
  if (error) throw fromDbError(error);
}

export async function attendanceReport(ctx: AppContext, from: string, to: string) {
  assertCan(ctx, "attendance.read");
  const [daily, top] = await Promise.all([
    ctx.db.rpc("stats_attendance_daily", { p_school: ctx.school.id, p_from: from, p_to: to }),
    ctx.db.rpc("stats_top_absentees", { p_school: ctx.school.id, p_from: from, p_to: to, p_limit: 20 }),
  ]);
  return { daily: daily.data ?? [], top: top.data ?? [] };
}
