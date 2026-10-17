import "server-only";
import { z } from "zod";
import { can, canSchoolWide } from "@/lib/authz";
import { computeClassResults, DEFAULT_POLICY, type GradingPolicy } from "@/features/grades/domain";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";
import { getCurrentYear, listTerms, pickCurrentTerm } from "@/server/repositories/academic";
import { fullName } from "@/lib/utils";
import type { Json } from "@/types/database";

export const assessmentSchema = z.object({
  id: z.uuid().optional(),
  class_subject_id: z.uuid("Enseignement requis"),
  term_id: z.uuid("Période requise"),
  assessment_type_id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(1).max(160),
  held_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_score: z.coerce.number().positive().max(1000),
  coefficient: z.coerce.number().positive().max(20),
});

export const gradeEntrySchema = z.object({
  assessment_id: z.uuid(),
  grades: z
    .array(
      z.object({
        student_id: z.uuid(),
        score: z.number().min(0).max(1000).nullable(),
        is_absent: z.boolean().default(false),
        is_excused: z.boolean().default(false),
        comment: z.string().trim().max(500).optional(),
      }),
    )
    .max(200),
});

export const listQuerySchema = z.object({
  class: z.uuid().optional().catch(undefined),
  term: z.uuid().optional().catch(undefined),
  status: z.enum(["draft", "submitted", "validated", "published"]).optional().catch(undefined),
});

export async function assessmentFrame(ctx: AppContext) {
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const terms = year ? await listTerms(ctx.db, ctx.school.id, year.id) : [];
  return { year, terms, currentTerm: pickCurrentTerm(terms) };
}

/** Teaching assignments where the user may create assessments (teacher: own; managers: all). */
export async function writableClassSubjects(ctx: AppContext, yearId: string) {
  if (!can(ctx, "assessments.create")) return [];
  let q = ctx.db
    .from("class_subjects")
    .select(
      "id, coefficient, class:classes!class_subjects_school_id_class_id_fkey!inner(id, name, academic_year_id), subject:subjects!class_subjects_school_id_subject_id_fkey(id, name)",
    )
    .eq("school_id", ctx.school.id)
    .eq("class.academic_year_id", yearId);
  if (!canSchoolWide(ctx, "assessments.create")) {
    if (!ctx.school.staff_id) return [];
    q = q.eq("teacher_id", ctx.school.staff_id);
  }
  return unwrapList(await q).sort((a, b) =>
    `${a.class?.name}${a.subject?.name}`.localeCompare(`${b.class?.name}${b.subject?.name}`),
  );
}

export async function listAssessments(ctx: AppContext, query: z.infer<typeof listQuerySchema>, termId?: string) {
  assertCan(ctx, "assessments.read");
  let q = ctx.db
    .from("assessments")
    .select(
      "id, title, held_on, max_score, coefficient, status, term_id, cs:class_subjects!assessments_school_id_class_subject_id_fkey!inner(id, class_id, teacher_id, class:classes!class_subjects_school_id_class_id_fkey(id, name), subject:subjects!class_subjects_school_id_subject_id_fkey(name, color)), type:assessment_types!assessments_school_id_assessment_type_id_fkey(name), grades(count)",
    )
    .eq("school_id", ctx.school.id)
    .order("held_on", { ascending: false })
    .limit(200);
  if (termId) q = q.eq("term_id", termId);
  if (query.class) q = q.eq("cs.class_id", query.class);
  if (query.status) q = q.eq("status", query.status);
  return unwrapList(await q);
}

export async function saveAssessment(ctx: AppContext, input: z.infer<typeof assessmentSchema>) {
  const row = {
    class_subject_id: input.class_subject_id,
    term_id: input.term_id,
    assessment_type_id: input.assessment_type_id ?? null,
    title: input.title,
    held_on: input.held_on,
    max_score: input.max_score,
    coefficient: input.coefficient,
  };
  if (input.id) {
    assertCan(ctx, "assessments.update");
    return unwrap(
      await ctx.db
        .from("assessments")
        .update(row)
        .eq("id", input.id)
        .in("status", ["draft", "submitted"])
        .select("id")
        .single(),
    ).id;
  }
  assertCan(ctx, "assessments.create");
  return unwrap(
    await ctx.db
      .from("assessments")
      .insert({ ...row, school_id: ctx.school.id, created_by: ctx.user.id })
      .select("id")
      .single(),
  ).id;
}

export async function deleteAssessment(ctx: AppContext, id: string) {
  assertCan(ctx, "assessments.delete");
  const { error, count } = await ctx.db
    .from("assessments")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw fromDbError(error);
  if (!count) throw new AppError("INVALID_TRANSITION", "Seules les évaluations en brouillon peuvent être supprimées.");
}

export async function getAssessmentSheet(ctx: AppContext, id: string) {
  assertCan(ctx, "assessments.read");
  const { data: a, error } = await ctx.db
    .from("assessments")
    .select(
      "id, title, held_on, max_score, coefficient, status, term_id, validated_at, published_at, class_subject_id, cs:class_subjects!assessments_school_id_class_subject_id_fkey(id, class_id, teacher_id, class:classes!class_subjects_school_id_class_id_fkey(id, name), subject:subjects!class_subjects_school_id_subject_id_fkey(name), teacher:staff_members!class_subjects_school_id_teacher_id_fkey(first_name, last_name)), term:terms!assessments_school_id_term_id_fkey(name), type:assessment_types!assessments_school_id_assessment_type_id_fkey(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!a) throw new AppError("NOT_FOUND");
  const [roster, grades, revisions] = await Promise.all([
    ctx.db
      .from("enrollments")
      .select("student:students!enrollments_school_id_student_id_fkey(id, first_name, last_name, matricule)")
      .eq("class_id", a.cs!.class_id)
      .in("status", ["active"]),
    ctx.db
      .from("grades")
      .select("id, student_id, score, is_absent, is_excused, comment, updated_at")
      .eq("assessment_id", id),
    can(ctx, "grades.validate") || can(ctx, "grades.create")
      ? ctx.db
          .from("grade_revisions")
          .select("id, student_id, old_score, new_score, reason, changed_at, assessment_status")
          .eq("assessment_id", id)
          .order("changed_at", { ascending: false })
          .limit(50)
      : null,
  ]);
  const students = (roster.data ?? [])
    .map((r) => r.student)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((x, y) => x.last_name.localeCompare(y.last_name) || x.first_name.localeCompare(y.first_name));
  const isTeacher = Boolean(ctx.school.staff_id && a.cs?.teacher_id === ctx.school.staff_id);
  const canWrite = canSchoolWide(ctx, "grades.create") || (can(ctx, "grades.create", ["assigned"]) && isTeacher);
  return {
    assessment: a,
    students,
    grades: grades.data ?? [],
    revisions: revisions?.data ?? [],
    canWrite: canWrite && ["draft", "submitted"].includes(a.status),
    canCorrect: canSchoolWide(ctx, "grades.validate") && ["validated", "published"].includes(a.status),
    canSubmit: (canWrite || isTeacher) && a.status === "draft",
    canValidate: canSchoolWide(ctx, "assessments.validate") && ["draft", "submitted"].includes(a.status),
    canPublish: canSchoolWide(ctx, "assessments.publish") && a.status === "validated",
    canUnpublish: canSchoolWide(ctx, "assessments.validate") && a.status === "published",
  };
}

export async function saveGrades(ctx: AppContext, input: z.infer<typeof gradeEntrySchema>) {
  assertCan(ctx, "grades.create");
  const { data: a } = await ctx.db
    .from("assessments")
    .select("max_score, status")
    .eq("id", input.assessment_id)
    .maybeSingle();
  if (!a) throw new AppError("NOT_FOUND");
  if (!["draft", "submitted"].includes(a.status)) throw new AppError("GRADE_LOCKED");
  for (const g of input.grades) {
    if (g.score !== null && g.score > Number(a.max_score)) throw new AppError("SCORE_OUT_OF_RANGE");
  }
  const { error } = await ctx.db.rpc("save_grades", { p_assessment: input.assessment_id, p_grades: input.grades });
  if (error) throw fromDbError(error);
}

export async function setAssessmentStatus(
  ctx: AppContext,
  id: string,
  status: "draft" | "submitted" | "validated" | "published",
) {
  const { error } = await ctx.db.rpc("set_assessment_status", { p_assessment: id, p_status: status });
  if (error) throw fromDbError(error);
}

export async function correctGrade(
  ctx: AppContext,
  gradeId: string,
  score: number | null,
  isAbsent: boolean,
  reason: string,
) {
  assertCan(ctx, "grades.validate", ["school"]);
  const { error } = await ctx.db.rpc("correct_grade", {
    p_grade: gradeId,
    p_score: score ?? 0,
    p_is_absent: isAbsent,
    p_reason: reason,
  });
  if (error) throw fromDbError(error);
}

/** Grades of one student (RLS: families only see published assessments). */
export async function studentGrades(ctx: AppContext, studentId: string, termId: string) {
  assertCan(ctx, "grades.read");
  const [grades, subjects] = await Promise.all([
    ctx.db
      .from("grades")
      .select(
        "id, score, is_absent, comment, assessment:assessments!grades_school_id_assessment_id_fkey!inner(id, title, held_on, max_score, coefficient, status, term_id, cs:class_subjects!assessments_school_id_class_subject_id_fkey(subject:subjects!class_subjects_school_id_subject_id_fkey(id, name, color)))",
      )
      .eq("student_id", studentId)
      .eq("assessment.term_id", termId),
    ctx.db.rpc("stats_student_subjects", { p_school: ctx.school.id, p_student: studentId, p_term: termId }),
  ]);
  return { grades: unwrapList(grades), subjects: subjects.data ?? [] };
}

// ---------------------------------------------------------------------------
// Report cards
// ---------------------------------------------------------------------------

async function policyFor(ctx: AppContext, levelId: string): Promise<GradingPolicy> {
  const { data } = await ctx.db
    .from("grading_policies")
    .select(
      "scale_max, passing_mark, decimals, rounding, missing_policy, excused_policy, ranking_enabled, mentions, level_id, is_default",
    )
    .eq("school_id", ctx.school.id)
    .or(`level_id.eq.${levelId},is_default.eq.true`);
  const p = (data ?? []).find((x) => x.level_id === levelId) ?? (data ?? []).find((x) => x.is_default);
  if (!p) return DEFAULT_POLICY;
  return {
    scale_max: Number(p.scale_max),
    passing_mark: Number(p.passing_mark),
    decimals: p.decimals,
    rounding: p.rounding as GradingPolicy["rounding"],
    missing_policy: p.missing_policy as GradingPolicy["missing_policy"],
    excused_policy: p.excused_policy as GradingPolicy["excused_policy"],
    ranking_enabled: p.ranking_enabled,
    mentions: Array.isArray(p.mentions) ? (p.mentions as { min: number; label: string }[]) : DEFAULT_POLICY.mentions,
  };
}

/** Computes (TS engine) and stores (atomic RPC) the report cards of a class for a period. */
export async function generateReportCards(ctx: AppContext, classId: string, termId: string) {
  assertCan(ctx, "report_cards.create", ["school"]);
  const db = ctx.db;
  const [{ data: cls }, { data: term }] = await Promise.all([
    db.from("classes").select("id, level_id").eq("id", classId).maybeSingle(),
    db.from("terms").select("id, starts_on, ends_on").eq("id", termId).maybeSingle(),
  ]);
  if (!cls || !term) throw new AppError("NOT_FOUND");

  const [roster, subjects, assessments, policy] = await Promise.all([
    db.from("enrollments").select("student_id").eq("class_id", classId).eq("status", "active"),
    db
      .from("class_subjects")
      .select(
        "id, coefficient, subject_id, subject:subjects!class_subjects_school_id_subject_id_fkey(name), teacher:staff_members!class_subjects_school_id_teacher_id_fkey(first_name, last_name)",
      )
      .eq("class_id", classId),
    db
      .from("assessments")
      .select(
        "id, max_score, coefficient, class_subject_id, cs:class_subjects!assessments_school_id_class_subject_id_fkey!inner(class_id, subject_id)",
      )
      .eq("term_id", termId)
      .eq("cs.class_id", classId)
      .in("status", ["validated", "published"]),
    policyFor(ctx, cls.level_id),
  ]);
  const studentIds = (roster.data ?? []).map((r) => r.student_id);
  if (!studentIds.length) throw new AppError("VALIDATION", "La classe ne compte aucun élève.");
  const assessmentRows = unwrapList(assessments);
  if (!assessmentRows.length) throw new AppError("VALIDATION", "Aucune évaluation validée pour cette période.");

  const grades = unwrapList(
    await db
      .from("grades")
      .select("assessment_id, student_id, score, is_absent, is_excused")
      .in(
        "assessment_id",
        assessmentRows.map((a) => a.id),
      ),
  );
  const { data: att } = await db
    .from("attendance_records")
    .select(
      "student_id, status, session:attendance_sessions!attendance_records_school_id_session_id_fkey!inner(date, class_id)",
    )
    .eq("session.class_id", classId)
    .gte("session.date", term.starts_on)
    .lte("session.date", term.ends_on)
    .neq("status", "present");

  const subjectRows = unwrapList(subjects);
  const result = computeClassResults({
    studentIds,
    subjects: subjectRows.map((s, i) => ({
      subject_id: s.subject_id,
      subject_name: s.subject?.name ?? "",
      coefficient: Number(s.coefficient),
      teacher_name: s.teacher ? fullName(s.teacher) : null,
      position: i,
    })),
    assessments: assessmentRows.map((a) => ({
      id: a.id,
      subject_id: a.cs!.subject_id,
      max_score: Number(a.max_score),
      coefficient: Number(a.coefficient),
    })),
    grades: grades.map((g) => ({ ...g, score: g.score === null ? null : Number(g.score) })),
    policy,
  });

  const cards = result.students.map((s) => ({
    student_id: s.student_id,
    average: s.average,
    rank: s.rank,
    class_size: result.class_size,
    class_average: result.class_average,
    mention: s.mention,
    absences_count: (att ?? []).filter(
      (r) => r.student_id === s.student_id && (r.status === "absent" || r.status === "excused"),
    ).length,
    lates_count: (att ?? []).filter((r) => r.student_id === s.student_id && r.status === "late").length,
    lines: s.lines,
  }));
  const { data, error } = await db.rpc("save_report_cards", {
    p_school: ctx.school.id,
    p_term: termId,
    p_class: classId,
    p_cards: cards as unknown as Json,
  });
  if (error) throw fromDbError(error);
  return { saved: data, passRate: result.pass_rate, classAverage: result.class_average };
}

export async function listReportCards(
  ctx: AppContext,
  filter: { classId?: string; termId?: string; studentId?: string },
) {
  assertCan(ctx, "report_cards.read");
  let q = ctx.db
    .from("report_cards")
    .select(
      "id, average, rank, class_size, class_average, mention, status, published_at, appreciation, student:students!report_cards_school_id_student_id_fkey(id, first_name, last_name, matricule), term:terms!report_cards_school_id_term_id_fkey(id, name), class:classes!report_cards_school_id_class_id_fkey(id, name)",
    )
    .eq("school_id", ctx.school.id)
    .limit(500);
  if (filter.classId) q = q.eq("class_id", filter.classId);
  if (filter.termId) q = q.eq("term_id", filter.termId);
  if (filter.studentId) q = q.eq("student_id", filter.studentId);
  const rows = unwrapList(await q);
  return rows.sort(
    (a, b) =>
      (a.rank ?? 9999) - (b.rank ?? 9999) || (a.student?.last_name ?? "").localeCompare(b.student?.last_name ?? ""),
  );
}

export async function getReportCard(ctx: AppContext, id: string) {
  assertCan(ctx, "report_cards.read");
  const { data, error } = await ctx.db
    .from("report_cards")
    .select(
      "*, student:students!report_cards_school_id_student_id_fkey(id, first_name, last_name, matricule, birth_date), term:terms!report_cards_school_id_term_id_fkey(name, starts_on, ends_on), class:classes!report_cards_school_id_class_id_fkey(name, homeroom:staff_members!classes_school_id_homeroom_staff_id_fkey(first_name, last_name), year:academic_years!classes_school_id_academic_year_id_fkey(name)), report_card_lines(subject_id, subject_name, teacher_name, coefficient, average, class_average, min_average, max_average, rank, teacher_comment, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return { ...data, report_card_lines: [...(data.report_card_lines ?? [])].sort((a, b) => a.position - b.position) };
}

export async function setReportCardsStatus(
  ctx: AppContext,
  ids: string[],
  status: "draft" | "validated" | "published",
) {
  const { data, error } = await ctx.db.rpc("set_report_cards_status", { p_ids: ids, p_status: status });
  if (error) throw fromDbError(error);
  return data ?? 0;
}

export async function saveAppreciation(ctx: AppContext, id: string, appreciation: string, decision?: string) {
  assertCan(ctx, "report_cards.create", ["school"]);
  unwrap(
    await ctx.db
      .from("report_cards")
      .update({ appreciation: appreciation || null, decision: decision || null })
      .eq("id", id)
      .eq("status", "draft")
      .select("id")
      .single(),
  );
}
