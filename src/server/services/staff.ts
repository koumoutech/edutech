import "server-only";
import { z } from "zod";
import { can, canSchoolWide } from "@/lib/authz";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const staffSchema = z.object({
  id: z.uuid().optional(),
  employee_number: z.string().trim().min(2).max(32),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  gender: z.enum(["F", "M", "X"]).optional().or(z.literal("").transform(() => undefined)),
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  phone: opt(40),
  job_title: z.string().trim().min(2).max(120),
  department: opt(80),
  is_teacher: z.literal("on").optional().transform((v) => v === "on"),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});

export const contractSchema = z.object({
  staff_id: z.uuid(),
  contract_type: z.enum(["permanent", "fixed_term", "part_time", "internship", "volunteer", "civil_servant"]),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  monthly_salary: z.coerce.number().min(0).max(1e10).optional().or(z.literal("").transform(() => undefined)),
  weekly_hours: z.coerce.number().min(0).max(80).optional().or(z.literal("").transform(() => undefined)),
});

export const evaluationSchema = z.object({
  staff_id: z.uuid(),
  period_label: z.string().trim().min(2).max(60),
  score: z.coerce.number().min(0).max(20).optional().or(z.literal("").transform(() => undefined)),
  strengths: opt(2000),
  improvements: opt(2000),
});

export const leaveSchema = z
  .object({
    staff_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    kind: z.enum(["annual_leave", "sick_leave", "maternity", "paternity", "training", "unpaid", "absence", "other"]),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    half_day: z.literal("on").optional().transform((v) => v === "on"),
    reason: opt(1000),
  })
  .refine((v) => v.ends_on >= v.starts_on, { path: ["ends_on"], message: "La fin précède le début" });

export async function listStaff(ctx: AppContext, opts: { q?: string; teachers?: boolean }) {
  assertCan(ctx, "staff.read");
  let q = ctx.db
    .from("staff_members")
    .select("id, employee_number, first_name, last_name, job_title, department, is_teacher, status, email, phone, user_id")
    .eq("school_id", ctx.school.id)
    .neq("status", "archived")
    .order("last_name");
  if (opts.teachers) q = q.eq("is_teacher", true);
  if (opts.q) {
    const t = opts.q.replace(/[%_,().*\\]/g, " ").trim();
    if (t) q = q.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,job_title.ilike.%${t}%,employee_number.ilike.%${t}%`);
  }
  return unwrapList(await q);
}

export async function getStaff(ctx: AppContext, id: string) {
  assertCan(ctx, "staff.read");
  const { data: staff, error } = await ctx.db.from("staff_members").select("*").eq("id", id).maybeSingle();
  if (error) throw fromDbError(error);
  if (!staff) throw new AppError("NOT_FOUND");
  const isSelf = staff.user_id === ctx.user.id;
  if (!canSchoolWide(ctx, "staff.read") && !isSelf) throw new AppError("FORBIDDEN");
  const hr = canSchoolWide(ctx, "hr.read") || (isSelf && can(ctx, "hr.read"));
  const [qualifications, contracts, evaluations, leaves, assignments, documents] = await Promise.all([
    ctx.db.from("staff_qualifications").select("id, title, institution, obtained_on").eq("staff_id", id),
    hr ? ctx.db.from("staff_contracts").select("id, contract_type, starts_on, ends_on, monthly_salary, weekly_hours, status").eq("staff_id", id).order("starts_on", { ascending: false }) : null,
    hr ? ctx.db.from("staff_evaluations").select("id, period_label, score, strengths, improvements, evaluated_on").eq("staff_id", id).order("evaluated_on", { ascending: false }) : null,
    ctx.db.from("leave_requests").select("id, kind, starts_on, ends_on, status, reason").eq("staff_id", id).order("starts_on", { ascending: false }).limit(20),
    ctx.db
      .from("class_subjects")
      .select("id, weekly_hours, coefficient, class:classes!class_subjects_school_id_class_id_fkey(name), subject:subjects!class_subjects_school_id_subject_id_fkey(name)")
      .eq("teacher_id", id),
    hr ? ctx.db.from("documents").select("id, title, created_at, storage_path").eq("staff_id", id).is("deleted_at", null).order("created_at", { ascending: false }) : null,
  ]);
  return {
    staff,
    isSelf,
    hr,
    qualifications: qualifications.data ?? [],
    contracts: contracts?.data ?? [],
    evaluations: evaluations?.data ?? [],
    leaves: leaves.data ?? [],
    assignments: assignments.data ?? [],
    documents: documents?.data ?? [],
  };
}

export async function saveStaff(ctx: AppContext, input: z.infer<typeof staffSchema>) {
  assertCan(ctx, "staff.manage", ["school"]);
  const row = {
    employee_number: input.employee_number,
    first_name: input.first_name,
    last_name: input.last_name,
    gender: input.gender ?? null,
    email: input.email ?? null,
    phone: input.phone,
    job_title: input.job_title,
    department: input.department,
    is_teacher: input.is_teacher,
    hire_date: input.hire_date ?? null,
  };
  const q = input.id
    ? ctx.db.from("staff_members").update(row).eq("id", input.id).select("id").single()
    : ctx.db.from("staff_members").insert({ ...row, school_id: ctx.school.id }).select("id").single();
  return unwrap(await q).id;
}

export async function addContract(ctx: AppContext, input: z.infer<typeof contractSchema>) {
  assertCan(ctx, "hr.manage", ["school"]);
  const { error } = await ctx.db.from("staff_contracts").insert({
    school_id: ctx.school.id,
    staff_id: input.staff_id,
    contract_type: input.contract_type,
    starts_on: input.starts_on,
    ends_on: input.ends_on ?? null,
    monthly_salary: input.monthly_salary ?? null,
    weekly_hours: input.weekly_hours ?? null,
    status: "active",
  });
  if (error) throw fromDbError(error);
}

export async function addEvaluation(ctx: AppContext, input: z.infer<typeof evaluationSchema>) {
  assertCan(ctx, "hr.manage", ["school"]);
  const { error } = await ctx.db.from("staff_evaluations").insert({
    school_id: ctx.school.id,
    staff_id: input.staff_id,
    period_label: input.period_label,
    score: input.score ?? null,
    strengths: input.strengths,
    improvements: input.improvements,
    evaluator_id: ctx.user.id,
  });
  if (error) throw fromDbError(error);
}

export async function listLeaves(ctx: AppContext) {
  assertCan(ctx, "leaves.read");
  return unwrapList(
    await ctx.db
      .from("leave_requests")
      .select("id, kind, starts_on, ends_on, half_day, status, reason, review_comment, created_at, staff_id, created_by, staff:staff_members!leave_requests_school_id_staff_id_fkey(id, first_name, last_name, job_title), substitute:staff_members!leave_requests_school_id_substitute_staff_id_fkey(first_name, last_name)")
      .eq("school_id", ctx.school.id)
      .order("starts_on", { ascending: false })
      .limit(200),
  );
}

export async function requestLeave(ctx: AppContext, input: z.infer<typeof leaveSchema>) {
  assertCan(ctx, "leaves.create");
  const staffId = input.staff_id && canSchoolWide(ctx, "leaves.create") ? input.staff_id : ctx.school.staff_id;
  if (!staffId) throw new AppError("VALIDATION", "Votre compte n'est pas relié à une fiche du personnel.");
  const { error } = await ctx.db.from("leave_requests").insert({
    school_id: ctx.school.id,
    staff_id: staffId,
    kind: input.kind,
    starts_on: input.starts_on,
    ends_on: input.ends_on,
    half_day: input.half_day,
    reason: input.reason,
    created_by: ctx.user.id,
  });
  if (error) throw fromDbError(error);
}

export async function reviewLeave(ctx: AppContext, id: string, status: "approved" | "rejected", comment?: string, substituteId?: string) {
  assertCan(ctx, "leaves.validate", ["school"]);
  const { error } = await ctx.db.rpc("review_leave_request", { p_id: id, p_status: status, p_comment: comment, p_substitute: substituteId });
  if (error) throw fromDbError(error);
}

export async function cancelLeave(ctx: AppContext, id: string) {
  const { error } = await ctx.db.rpc("cancel_leave_request", { p_id: id });
  if (error) throw fromDbError(error);
}
