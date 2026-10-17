import "server-only";
import { can, canSchoolWide } from "@/lib/authz";
import type { ImportRow } from "@/features/students/import";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";
import { getCurrentYear, pageRange } from "@/server/repositories/academic";
import type { createStudentSchema, studentListQuerySchema, updateStudentSchema } from "@/schemas/students";
import type { z } from "zod";

export const STUDENTS_PAGE_SIZE = 25;

export async function listStudents(ctx: AppContext, query: z.infer<typeof studentListQuerySchema>) {
  assertCan(ctx, "students.read");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const [from, to] = pageRange(query.page, STUDENTS_PAGE_SIZE);

  if (query.filter === "incomplete") {
    const { data, error } = await ctx.db.rpc("incomplete_student_files", { p_school: ctx.school.id, p_limit: 500 });
    if (error) throw fromDbError(error);
    return { year, rows: [], incomplete: data ?? [], total: data?.length ?? 0 };
  }

  // !inner on enrollments when filtering by class, so only students of that class are returned.
  const enrollmentEmbed = query.class
    ? "enrollments!inner(id, status, class_id, academic_year_id, class:classes!enrollments_school_id_class_id_fkey(id, name))"
    : "enrollments(id, status, class_id, academic_year_id, class:classes!enrollments_school_id_class_id_fkey(id, name))";

  let q = ctx.db
    .from("students")
    .select(`id, matricule, first_name, last_name, gender, birth_date, status, ${enrollmentEmbed}`, { count: "exact" })
    .eq("school_id", ctx.school.id)
    .order("last_name")
    .order("first_name")
    .range(from, to);

  if (query.status !== "all") q = q.eq("status", query.status);
  if (query.class) q = q.eq("enrollments.class_id", query.class).eq("enrollments.status", "active");
  if (query.q) {
    // Escape PostgREST filter syntax characters to prevent filter injection.
    const term = query.q.replace(/[%_,().*\\]/g, " ").trim();
    if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,matricule.ilike.%${term}%`);
  }
  const { data, error, count } = await q;
  if (error) throw fromDbError(error);
  const rows = (data ?? []).map((s) => {
    const enrollments = (s.enrollments ?? []) as {
      status: string;
      academic_year_id: string;
      class: { id: string; name: string } | null;
    }[];
    const current = enrollments.find((e) => e.status === "active" && e.academic_year_id === year?.id);
    return { ...s, className: current?.class?.name ?? null, classId: current?.class?.id ?? null };
  });
  return { year, rows, incomplete: [], total: count ?? 0 };
}

export async function getStudent(ctx: AppContext, id: string) {
  assertCan(ctx, "students.read");
  const db = ctx.db;
  const { data: student, error } = await db
    .from("students")
    .select(
      "*, enrollments(id, status, kind, enrolled_on, left_on, leave_reason, academic_year_id, year:academic_years!enrollments_school_id_academic_year_id_fkey(name, is_current), class:classes!enrollments_school_id_class_id_fkey(id, name)), student_guardians(relationship, is_legal_guardian, is_emergency_contact, is_billing_contact, receives_notifications, guardian:guardians!student_guardians_school_id_guardian_id_fkey(id, first_name, last_name, phone, email, profession, user_id)), emergency_contacts(id, full_name, relationship, phone, priority)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!student) throw new AppError("NOT_FOUND");

  const [health, documents, attendance, invoices, docTypes] = await Promise.all([
    can(ctx, "health.read") ? db.from("student_health").select("*").eq("student_id", id).maybeSingle() : null,
    can(ctx, "documents.read")
      ? db
          .from("documents")
          .select(
            "id, title, category, mime_type, size_bytes, created_at, storage_path, document_type_id, visible_to_family",
          )
          .eq("student_id", id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : null,
    db.from("attendance_records").select("status").eq("student_id", id),
    can(ctx, "finance.read")
      ? db
          .from("invoices")
          .select("id, number, total, amount_paid, balance, due_date, status")
          .eq("student_id", id)
          .order("issue_date", { ascending: false })
      : null,
    db
      .from("required_document_types")
      .select("id, name, is_mandatory")
      .eq("school_id", ctx.school.id)
      .eq("applies_to", "student"),
  ]);

  const att = attendance.data ?? [];
  return {
    student,
    enrollments: [...(student.enrollments ?? [])].sort((a, b) =>
      (b.enrolled_on ?? "").localeCompare(a.enrolled_on ?? ""),
    ),
    guardians: student.student_guardians ?? [],
    health: health?.data ?? null,
    documents: documents?.data ?? [],
    docTypes: docTypes.data ?? [],
    attendance: {
      total: att.length,
      absent: att.filter((a) => a.status === "absent").length,
      excused: att.filter((a) => a.status === "excused").length,
      late: att.filter((a) => a.status === "late").length,
    },
    invoices: invoices?.data ?? [],
  };
}

export async function createStudent(ctx: AppContext, input: z.infer<typeof createStudentSchema>) {
  assertCan(ctx, "students.create");
  if (input.class_id) assertCan(ctx, "enrollments.manage");
  const year = input.academic_year_id ?? (await getCurrentYear(ctx.db, ctx.school.id))?.id;
  const { data, error } = await ctx.db.rpc("create_student", {
    p_school: ctx.school.id,
    p_student: input.student,
    p_guardians: input.guardians,
    p_year: input.class_id ? year : undefined,
    p_class: input.class_id,
  });
  if (error) throw fromDbError(error);
  return data as string;
}

export async function updateStudent(ctx: AppContext, input: z.infer<typeof updateStudentSchema>) {
  assertCan(ctx, "students.update");
  const { id, ...fields } = input;
  const patch = {
    ...fields,
    matricule: fields.matricule,
    gender: fields.gender ?? null,
    birth_date: fields.birth_date ?? null,
    birth_place: fields.birth_place ?? null,
    nationality: fields.nationality ?? null,
    address: fields.address ?? null,
    phone: fields.phone ?? null,
    email: fields.email ?? null,
    previous_school: fields.previous_school ?? null,
    notes: fields.notes ?? null,
  };
  if (!patch.matricule) delete (patch as Partial<typeof patch>).matricule;
  unwrap(await ctx.db.from("students").update(patch).eq("id", id).eq("school_id", ctx.school.id).select("id").single());
}

export async function enrollStudent(ctx: AppContext, studentId: string, classId: string) {
  assertCan(ctx, "enrollments.manage");
  const { data: cls } = await ctx.db
    .from("classes")
    .select("academic_year_id")
    .eq("id", classId)
    .eq("school_id", ctx.school.id)
    .maybeSingle();
  if (!cls) throw new AppError("NOT_FOUND");
  const { data: existing } = await ctx.db
    .from("enrollments")
    .select("id, class_id")
    .eq("student_id", studentId)
    .eq("academic_year_id", cls.academic_year_id)
    .eq("status", "active")
    .maybeSingle();
  if (existing) {
    if (existing.class_id === classId) return;
    const { error } = await ctx.db.rpc("change_class", {
      p_enrollment: existing.id,
      p_new_class: classId,
      p_reason: "Changement de classe",
    });
    if (error) throw fromDbError(error);
    return;
  }
  const { error } = await ctx.db.rpc("enroll_student", {
    p_school: ctx.school.id,
    p_student: studentId,
    p_year: cls.academic_year_id,
    p_class: classId,
    p_kind: "re_enrollment",
  });
  if (error) throw fromDbError(error);
}

export async function withdrawStudent(
  ctx: AppContext,
  studentId: string,
  status: "transferred" | "withdrawn" | "graduated",
  reason: string,
) {
  assertCan(ctx, "enrollments.manage");
  const { error } = await ctx.db.rpc("withdraw_student", { p_student: studentId, p_status: status, p_reason: reason });
  if (error) throw fromDbError(error);
}

export async function archiveStudent(ctx: AppContext, studentId: string, reason: string) {
  assertCan(ctx, "students.delete");
  const { error } = await ctx.db.rpc("archive_student", { p_student: studentId, p_reason: reason });
  if (error) throw fromDbError(error);
}

export async function importContext(ctx: AppContext) {
  assertCan(ctx, "students.create");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const [classes, matricules] = await Promise.all([
    year ? ctx.db.from("classes").select("id, name").eq("academic_year_id", year.id) : null,
    ctx.db.from("students").select("matricule").eq("school_id", ctx.school.id),
  ]);
  return {
    year,
    classesByName: new Map((classes?.data ?? []).map((c) => [c.name.toLowerCase(), c.id])),
    existingMatricules: new Set((matricules.data ?? []).map((m) => m.matricule)),
  };
}

/** Imports validated rows one student at a time (each one atomic); stops reporting per line. */
export async function importStudents(ctx: AppContext, rows: ImportRow[]) {
  assertCan(ctx, "students.create");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const results: { line: number; ok: boolean; error?: string }[] = [];
  for (const row of rows) {
    const { error } = await ctx.db.rpc("create_student", {
      p_school: ctx.school.id,
      p_student: row.student,
      p_guardians: row.guardian ? [{ ...row.guardian, is_emergency_contact: true, is_billing_contact: true }] : [],
      p_year: row.class_id && year && can(ctx, "enrollments.manage") ? year.id : undefined,
      p_class: row.class_id && can(ctx, "enrollments.manage") ? row.class_id : undefined,
    });
    results.push({ line: row.line, ok: !error, error: error ? fromDbError(error).message : undefined });
  }
  return results;
}

/** Rows for the CSV export — only what the caller may read (RLS) and only with students.export. */
export async function exportStudents(ctx: AppContext) {
  assertCan(ctx, "students.export");
  if (!canSchoolWide(ctx, "students.read")) throw new AppError("FORBIDDEN");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const rows: Awaited<ReturnType<typeof fetchPage>> = [];
  async function fetchPage(from: number) {
    return unwrapList(
      await ctx.db
        .from("students")
        .select(
          "matricule, first_name, last_name, gender, birth_date, birth_place, status, enrollments(status, academic_year_id, class:classes!enrollments_school_id_class_id_fkey(name))",
        )
        .eq("school_id", ctx.school.id)
        .order("last_name")
        .range(from, from + 999),
    );
  }
  for (let from = 0; ; from += 1000) {
    const page = await fetchPage(from);
    rows.push(...page);
    if (page.length < 1000 || rows.length >= 20000) break;
  }
  return rows.map((s) => ({
    ...s,
    className: s.enrollments?.find((e) => e.status === "active" && e.academic_year_id === year?.id)?.class?.name ?? "",
  }));
}

export async function addGuardian(
  ctx: AppContext,
  studentId: string,
  g: {
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
    profession?: string;
    relationship: string;
    is_emergency_contact: boolean;
    is_billing_contact: boolean;
  },
) {
  assertCan(ctx, "guardians.manage");
  const guardian = unwrap(
    await ctx.db
      .from("guardians")
      .insert({
        school_id: ctx.school.id,
        first_name: g.first_name,
        last_name: g.last_name,
        phone: g.phone ?? null,
        email: g.email ?? null,
        profession: g.profession ?? null,
      })
      .select("id")
      .single(),
  );
  unwrap(
    await ctx.db
      .from("student_guardians")
      .insert({
        school_id: ctx.school.id,
        student_id: studentId,
        guardian_id: guardian.id,
        relationship: g.relationship,
        is_emergency_contact: g.is_emergency_contact,
        is_billing_contact: g.is_billing_contact,
      })
      .select("student_id")
      .single(),
  );
  return guardian.id;
}

export async function unlinkGuardian(ctx: AppContext, studentId: string, guardianId: string) {
  assertCan(ctx, "guardians.manage");
  const { error } = await ctx.db
    .from("student_guardians")
    .delete()
    .eq("student_id", studentId)
    .eq("guardian_id", guardianId);
  if (error) throw fromDbError(error);
}
