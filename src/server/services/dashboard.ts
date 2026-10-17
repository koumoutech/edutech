import "server-only";
import { can, canSchoolWide } from "@/lib/authz";
import { isoDate } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { unwrapList } from "@/server/errors";
import { getCurrentYear, listTeacherAssignments, listTerms, pickCurrentTerm } from "@/server/repositories/academic";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

/** ISO weekday 1..7 */
export function todayWeekday(): number {
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}

export async function loadAcademicFrame(ctx: AppContext) {
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const terms = year ? await listTerms(ctx.db, ctx.school.id, year.id) : [];
  return { year, terms, term: pickCurrentTerm(terms) };
}

export interface Alert {
  label: string;
  count: number;
  href: string;
  tone: "warning" | "danger" | "info";
}

/** Items awaiting action for management roles. Each query is permission-gated and RLS-filtered. */
export async function managementAlerts(ctx: AppContext): Promise<Alert[]> {
  const db = ctx.db;
  const school = ctx.school.id;
  const tasks: Promise<Alert | null>[] = [];
  const countOf = (label: string, href: string, tone: Alert["tone"], q: PromiseLike<{ count: number | null }>) =>
    Promise.resolve(q).then((r) => ((r.count ?? 0) > 0 ? { label, count: r.count ?? 0, href, tone } : null));

  if (can(ctx, "assessments.validate")) {
    tasks.push(
      countOf("Évaluations à valider", "/app/assessments?status=submitted", "warning",
        db.from("assessments").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "submitted")),
    );
  }
  if (can(ctx, "justifications.validate")) {
    tasks.push(
      countOf("Justificatifs d'absence en attente", "/app/attendance/justifications", "warning",
        db.from("absence_justifications").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "pending")),
    );
  }
  if (can(ctx, "leaves.validate")) {
    tasks.push(
      countOf("Demandes de congé à traiter", "/app/staff/leaves", "warning",
        db.from("leave_requests").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "pending")),
    );
  }
  if (canSchoolWide(ctx, "finance.read")) {
    tasks.push(
      countOf("Factures en retard de paiement", "/app/finance/invoices?filter=overdue", "danger",
        db.from("invoices").select("id", { count: "exact", head: true }).eq("school_id", school)
          .in("status", ["issued", "partially_paid"]).lt("due_date", isoDate())),
    );
  }
  if (can(ctx, "expenses.validate")) {
    tasks.push(
      countOf("Dépenses à approuver", "/app/finance/expenses", "info",
        db.from("expenses").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "pending")),
    );
  }
  if (can(ctx, "requests.manage")) {
    tasks.push(
      countOf("Demandes administratives ouvertes", "/app/requests", "info",
        db.from("admin_requests").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "open")),
    );
  }
  return (await Promise.all(tasks)).filter((a): a is Alert => a !== null);
}

export async function directionData(ctx: AppContext) {
  const { year, terms, term } = await loadAcademicFrame(ctx);
  const school = ctx.school.id;
  const db = ctx.db;
  const [byLevel, attendance, performance, termAverages, finance, alerts, absentees] = await Promise.all([
    year ? db.rpc("stats_enrollment_by_level", { p_school: school, p_year: year.id }) : null,
    can(ctx, "attendance.read") ? db.rpc("stats_attendance_daily", { p_school: school, p_from: daysAgo(30), p_to: isoDate() }) : null,
    term && can(ctx, "grades.read") ? db.rpc("stats_class_performance", { p_school: school, p_term: term.id }) : null,
    year && can(ctx, "grades.read") ? db.rpc("stats_term_averages", { p_school: school, p_year: year.id }) : null,
    canSchoolWide(ctx, "finance.read") ? db.rpc("stats_finance_summary", { p_school: school, p_year: year?.id }) : null,
    managementAlerts(ctx),
    can(ctx, "attendance.read") ? db.rpc("stats_top_absentees", { p_school: school, p_from: daysAgo(30), p_to: isoDate(), p_limit: 5 }) : null,
  ]);
  return {
    year,
    term,
    terms,
    byLevel: byLevel?.data ?? [],
    attendance: attendance?.data ?? [],
    performance: performance?.data ?? [],
    termAverages: termAverages?.data ?? [],
    finance: finance?.data?.[0] ?? null,
    alerts,
    absentees: absentees?.data ?? [],
  };
}

export async function teacherData(ctx: AppContext) {
  const { year, term } = await loadAcademicFrame(ctx);
  const staffId = ctx.school.staff_id;
  const db = ctx.db;
  if (!year || !staffId) return { year, term, assignments: [], today: [], toGrade: [], atRisk: [], rollCalls: [], classSizes: {} as Record<string, number> };

  const assignments = await listTeacherAssignments(db, staffId, year.id);
  const classIds = [...new Set(assignments.map((a) => a.class?.id).filter(Boolean))] as string[];
  const csIds = assignments.map((a) => a.id);

  const [today, drafts, atRisk, sessions, enrollments] = await Promise.all([
    db
      .from("timetable_entries")
      .select("id, starts_at, ends_at, class_id, class:classes!timetable_entries_school_id_class_id_fkey(name), cs:class_subjects!timetable_entries_school_id_class_subject_id_fkey(subject:subjects!class_subjects_school_id_subject_id_fkey(name, color)), room:rooms!timetable_entries_school_id_room_id_fkey(name)")
      .eq("teacher_id", staffId)
      .eq("weekday", todayWeekday())
      .order("starts_at"),
    csIds.length
      ? db
          .from("assessments")
          .select("id, title, held_on, status, class_subject_id, grades(count)")
          .in("class_subject_id", csIds)
          .in("status", ["draft", "submitted"])
          .order("held_on")
          .limit(8)
      : null,
    term ? db.rpc("stats_students_at_risk", { p_school: ctx.school.id, p_term: term.id, p_limit: 8 }) : null,
    classIds.length ? db.from("attendance_sessions").select("class_id, timetable_entry_id").in("class_id", classIds).eq("date", isoDate()) : null,
    classIds.length ? db.from("enrollments").select("class_id").in("class_id", classIds).eq("status", "active") : null,
  ]);

  const classSizes: Record<string, number> = {};
  for (const e of enrollments?.data ?? []) if (e.class_id) classSizes[e.class_id] = (classSizes[e.class_id] ?? 0) + 1;
  const takenClasses = new Set((sessions?.data ?? []).map((s) => s.class_id));
  const todayRows = unwrapList(today);
  const rollCalls = todayRows.filter((t) => !takenClasses.has(t.class_id));

  return {
    year,
    term,
    assignments,
    today: todayRows,
    toGrade: drafts?.data ?? [],
    atRisk: atRisk?.data ?? [],
    rollCalls,
    classSizes,
  };
}

/** Data for one child as seen by a parent or by the student (RLS: published grades only). */
export async function studentSnapshot(ctx: AppContext, studentId: string) {
  const { year, term } = await loadAcademicFrame(ctx);
  const db = ctx.db;
  const [student, subjects, recentGrades, absences, reportCards, invoices, upcoming] = await Promise.all([
    db
      .from("students")
      .select("id, first_name, last_name, matricule, enrollments(class_id, status, academic_year_id, class:classes!enrollments_school_id_class_id_fkey(id, name))")
      .eq("id", studentId)
      .maybeSingle(),
    term ? db.rpc("stats_student_subjects", { p_school: ctx.school.id, p_student: studentId, p_term: term.id }) : null,
    db
      .from("grades")
      .select("id, score, is_absent, created_at, assessment:assessments!grades_school_id_assessment_id_fkey(title, max_score, held_on, status, cs:class_subjects!assessments_school_id_class_subject_id_fkey(subject:subjects!class_subjects_school_id_subject_id_fkey(name)))")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(6),
    db.from("attendance_records").select("status").eq("student_id", studentId).in("status", ["absent", "late", "excused"]),
    db.from("report_cards").select("id, average, rank, class_size, status, term:terms!report_cards_school_id_term_id_fkey(name)").eq("student_id", studentId).eq("status", "published"),
    can(ctx, "finance.read") ? db.from("invoices").select("id, number, total, balance, due_date, status").eq("student_id", studentId).neq("status", "cancelled") : null,
    db
      .from("assessments")
      .select("id, title, held_on, cs:class_subjects!assessments_school_id_class_subject_id_fkey!inner(class_id, subject:subjects!class_subjects_school_id_subject_id_fkey(name))")
      .gte("held_on", isoDate())
      .order("held_on")
      .limit(5),
  ]);
  const st = student.data;
  const active = st?.enrollments?.find((e) => e.status === "active" && e.academic_year_id === year?.id) ?? null;
  const absenceRows = absences.data ?? [];
  const subjectRows = subjects?.data ?? [];
  const weighted = subjectRows.reduce(
    (acc, s) => (s.average === null ? acc : { sum: acc.sum + Number(s.average) * Number(s.coefficient), w: acc.w + Number(s.coefficient) }),
    { sum: 0, w: 0 },
  );
  const classId = active?.class?.id;
  return {
    student: st,
    className: active?.class?.name ?? null,
    term,
    subjects: subjectRows,
    average: weighted.w > 0 ? Math.round((weighted.sum / weighted.w) * 100) / 100 : null,
    recentGrades: recentGrades.data ?? [],
    absences: absenceRows.filter((a) => a.status === "absent").length,
    excused: absenceRows.filter((a) => a.status === "excused").length,
    lates: absenceRows.filter((a) => a.status === "late").length,
    reportCards: reportCards.data ?? [],
    invoices: invoices?.data ?? [],
    balance: (invoices?.data ?? []).reduce((s, i) => s + Number(i.balance), 0),
    upcoming: (upcoming.data ?? []).filter((a) => a.cs?.class_id === classId),
  };
}

export async function linkedChildren(ctx: AppContext) {
  return unwrapList(
    await ctx.db
      .from("students")
      .select("id, first_name, last_name, matricule")
      .order("first_name"),
  );
}

export async function accountantData(ctx: AppContext) {
  const { year } = await loadAcademicFrame(ctx);
  const school = ctx.school.id;
  const db = ctx.db;
  const from = new Date();
  from.setMonth(from.getMonth() - 5, 1);
  const [summary, cashflow, overdue, unreconciled, expenses, alerts] = await Promise.all([
    db.rpc("stats_finance_summary", { p_school: school, p_year: year?.id }),
    db.rpc("stats_monthly_cashflow", { p_school: school, p_from: isoDate(from), p_to: isoDate() }),
    db
      .from("invoices")
      .select("id, number, balance, due_date, student:students!invoices_school_id_student_id_fkey(first_name, last_name)")
      .eq("school_id", school)
      .in("status", ["issued", "partially_paid"])
      .lt("due_date", isoDate())
      .order("balance", { ascending: false })
      .limit(6),
    db.from("payments").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "completed").eq("reconciled", false),
    year ? db.rpc("stats_expenses_by_category", { p_school: school, p_year: year.id }) : null,
    managementAlerts(ctx),
  ]);
  return {
    year,
    summary: summary.data?.[0] ?? null,
    cashflow: cashflow.data ?? [],
    overdue: overdue.data ?? [],
    unreconciled: unreconciled.count ?? 0,
    expenses: expenses?.data ?? [],
    alerts,
  };
}

export async function secretaryData(ctx: AppContext) {
  const { year } = await loadAcademicFrame(ctx);
  const school = ctx.school.id;
  const db = ctx.db;
  const monthStart = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [active, newThisMonth, incomplete, requests, transfers, byLevel, alerts] = await Promise.all([
    year ? db.from("enrollments").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id).eq("status", "active") : null,
    db.from("enrollments").select("id", { count: "exact", head: true }).eq("school_id", school).gte("enrolled_on", monthStart),
    db.rpc("incomplete_student_files", { p_school: school, p_limit: 8 }),
    db
      .from("admin_requests")
      .select("id, subject, kind, status, created_at")
      .eq("school_id", school)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(6),
    db
      .from("enrollments")
      .select("id, status, left_on, leave_reason, student:students!enrollments_school_id_student_id_fkey(id, first_name, last_name)")
      .eq("school_id", school)
      .in("status", ["transferred", "withdrawn"])
      .order("left_on", { ascending: false })
      .limit(5),
    year ? db.rpc("stats_enrollment_by_level", { p_school: school, p_year: year.id }) : null,
    managementAlerts(ctx),
  ]);
  return {
    year,
    active: active?.count ?? 0,
    newThisMonth: newThisMonth.count ?? 0,
    incomplete: incomplete.data ?? [],
    requests: requests.data ?? [],
    transfers: transfers.data ?? [],
    byLevel: byLevel?.data ?? [],
    alerts,
  };
}

export async function hrData(ctx: AppContext) {
  const school = ctx.school.id;
  const db = ctx.db;
  const today = isoDate();
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const [staff, teachers, pending, onLeave, ending] = await Promise.all([
    db.from("staff_members").select("id", { count: "exact", head: true }).eq("school_id", school).neq("status", "archived"),
    db.from("staff_members").select("id", { count: "exact", head: true }).eq("school_id", school).eq("is_teacher", true).neq("status", "archived"),
    db
      .from("leave_requests")
      .select("id, kind, starts_on, ends_on, staff:staff_members!leave_requests_school_id_staff_id_fkey(first_name, last_name)")
      .eq("school_id", school)
      .eq("status", "pending")
      .order("starts_on")
      .limit(6),
    db.from("leave_requests").select("id", { count: "exact", head: true }).eq("school_id", school).eq("status", "approved").lte("starts_on", today).gte("ends_on", today),
    can(ctx, "hr.read")
      ? db
          .from("staff_contracts")
          .select("id, ends_on, contract_type, staff:staff_members!staff_contracts_school_id_staff_id_fkey(first_name, last_name)")
          .eq("school_id", school)
          .eq("status", "active")
          .gte("ends_on", today)
          .lte("ends_on", isoDate(in60))
          .order("ends_on")
      : null,
  ]);
  return {
    staff: staff.count ?? 0,
    teachers: teachers.count ?? 0,
    pending: pending.data ?? [],
    onLeave: onLeave.count ?? 0,
    ending: ending?.data ?? [],
  };
}

export async function recentAnnouncements(ctx: AppContext, limit = 4) {
  const { data } = await ctx.db
    .from("announcements")
    .select("id, title, body, priority, is_pinned, published_at")
    .eq("school_id", ctx.school.id)
    .eq("status", "published")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function recentNotifications(ctx: AppContext, limit = 5) {
  const { data } = await ctx.db
    .from("notifications")
    .select("id, title, body, link, read_at, created_at, type")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
