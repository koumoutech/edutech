import "server-only";
import { z } from "zod";
import { canSchoolWide } from "@/lib/authz";
import { isoDate } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";
import { pageRange } from "@/server/repositories/academic";

export const INVOICES_PAGE_SIZE = 25;

export const invoiceListSchema = z.object({
  filter: z.enum(["all", "open", "overdue", "paid", "draft", "cancelled"]).catch("all").default("all"),
  q: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export const invoiceLineSchema = z.object({
  fee_type_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().positive().max(1000).default(1),
  unit_amount: z.coerce.number().min(0).max(1e10),
  discount_amount: z.coerce.number().min(0).max(1e10).default(0),
});

export const createInvoiceSchema = z.object({
  student_id: z.uuid("Élève requis"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).optional(),
  issue: z.boolean().default(false),
  lines: z.array(invoiceLineSchema).min(1, "Ajoutez au moins une ligne").max(50),
});

export const paymentSchema = z.object({
  student_id: z.uuid(),
  amount: z.coerce.number().positive("Montant invalide").max(1e10),
  method_id: z.uuid("Mode de paiement requis"),
  reference: z.string().trim().max(120).optional(),
  payer_name: z.string().trim().max(160).optional(),
  paid_at: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  allocations: z.array(z.object({ invoice_id: z.uuid(), amount: z.coerce.number().positive() })).max(50).optional(),
});

export const expenseSchema = z.object({
  category_id: z.uuid("Catégorie requise"),
  supplier_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  description: z.string().trim().min(3).max(300),
  amount: z.coerce.number().positive().max(1e10),
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  reference: z.string().trim().max(120).optional(),
});

export async function listInvoices(ctx: AppContext, query: z.infer<typeof invoiceListSchema>) {
  assertCan(ctx, "finance.read");
  const [from, to] = pageRange(query.page, INVOICES_PAGE_SIZE);
  let q = ctx.db
    .from("invoices")
    .select("id, number, issue_date, due_date, total, amount_paid, balance, status, student:students!invoices_school_id_student_id_fkey!inner(id, first_name, last_name, matricule)", { count: "exact" })
    .eq("school_id", ctx.school.id)
    .order("due_date", { ascending: true })
    .order("number")
    .range(from, to);
  switch (query.filter) {
    case "open":
      q = q.in("status", ["issued", "partially_paid"]);
      break;
    case "overdue":
      q = q.in("status", ["issued", "partially_paid"]).lt("due_date", isoDate());
      break;
    case "paid":
    case "draft":
    case "cancelled":
      q = q.eq("status", query.filter);
      break;
  }
  if (query.q) {
    const term = query.q.replace(/[%_,().*\\]/g, " ").trim();
    if (term) q = q.or(`last_name.ilike.%${term}%,first_name.ilike.%${term}%,matricule.ilike.%${term}%`, { referencedTable: "students" });
  }
  const { data, error, count } = await q;
  if (error) throw fromDbError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getInvoice(ctx: AppContext, id: string) {
  assertCan(ctx, "finance.read");
  const { data, error } = await ctx.db
    .from("invoices")
    .select(
      "*, student:students!invoices_school_id_student_id_fkey(id, first_name, last_name, matricule), invoice_lines(id, description, quantity, unit_amount, discount_amount, line_total, position), invoice_installments(id, due_on, amount, position), payment_allocations(id, amount, is_active, created_at, payment:payments!payment_allocations_school_id_payment_id_fkey(id, receipt_number, paid_at, status, method:payment_methods!payments_school_id_method_id_fkey(name)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function createInvoice(ctx: AppContext, input: z.infer<typeof createInvoiceSchema>) {
  assertCan(ctx, "invoices.create", ["school"]);
  const { data: year } = await ctx.db.from("academic_years").select("id").eq("school_id", ctx.school.id).eq("is_current", true).maybeSingle();
  const { data, error } = await ctx.db.rpc("create_invoice", {
    p_school: ctx.school.id,
    p_student: input.student_id,
    p_due_date: input.due_date,
    p_lines: input.lines,
    p_year: year?.id,
    p_notes: input.notes,
    p_issue: input.issue,
  });
  if (error) throw fromDbError(error);
  return data as string;
}

export async function issueInvoice(ctx: AppContext, id: string) {
  assertCan(ctx, "invoices.create", ["school"]);
  const { error } = await ctx.db.rpc("issue_invoice", { p_invoice: id });
  if (error) throw fromDbError(error);
}

export async function cancelInvoice(ctx: AppContext, id: string, reason: string) {
  assertCan(ctx, "finance.manage", ["school"]);
  const { error } = await ctx.db.rpc("cancel_invoice", { p_invoice: id, p_reason: reason });
  if (error) throw fromDbError(error);
}

export async function generateClassInvoices(ctx: AppContext, classId: string, feeScheduleIds: string[], dueDate: string, issue: boolean) {
  assertCan(ctx, "invoices.create", ["school"]);
  const { data, error } = await ctx.db.rpc("generate_class_invoices", {
    p_school: ctx.school.id,
    p_class: classId,
    p_fee_schedules: feeScheduleIds,
    p_due_date: dueDate,
    p_issue: issue,
  });
  if (error) throw fromDbError(error);
  return data ?? 0;
}

export async function openInvoicesOf(ctx: AppContext, studentId: string) {
  return unwrapList(
    await ctx.db
      .from("invoices")
      .select("id, number, issue_date, due_date, total, balance")
      .eq("student_id", studentId)
      .in("status", ["issued", "partially_paid"])
      .gt("balance", 0)
      .order("due_date"),
  );
}

export async function recordPayment(ctx: AppContext, input: z.infer<typeof paymentSchema>) {
  assertCan(ctx, "payments.create", ["school"]);
  const { data, error } = await ctx.db.rpc("record_payment", {
    p_school: ctx.school.id,
    p_student: input.student_id,
    p_amount: input.amount,
    p_method: input.method_id,
    p_reference: input.reference,
    p_payer_name: input.payer_name,
    p_paid_at: input.paid_at ? new Date(input.paid_at).toISOString() : undefined,
    p_allocations: input.allocations?.length ? input.allocations : undefined,
    p_notes: input.notes,
  });
  if (error) throw fromDbError(error);
  return data as string;
}

export const paymentListSchema = z.object({
  filter: z.enum(["all", "unreconciled", "reversed"]).catch("all").default("all"),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export async function listPayments(ctx: AppContext, query: z.infer<typeof paymentListSchema>) {
  assertCan(ctx, "finance.read");
  const [from, to] = pageRange(query.page, INVOICES_PAGE_SIZE);
  let q = ctx.db
    .from("payments")
    .select("id, receipt_number, amount, paid_at, reference, status, reconciled, payer_name, method:payment_methods!payments_school_id_method_id_fkey(name, kind), student:students!payments_school_id_student_id_fkey(id, first_name, last_name)", { count: "exact" })
    .eq("school_id", ctx.school.id)
    .order("paid_at", { ascending: false })
    .range(from, to);
  if (query.filter === "unreconciled") q = q.eq("status", "completed").eq("reconciled", false);
  if (query.filter === "reversed") q = q.eq("status", "reversed");
  const { data, error, count } = await q;
  if (error) throw fromDbError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getPayment(ctx: AppContext, id: string) {
  assertCan(ctx, "finance.read");
  const { data, error } = await ctx.db
    .from("payments")
    .select(
      "id, receipt_number, amount, paid_at, reference, payer_name, status, reconciled, notes, method:payment_methods!payments_school_id_method_id_fkey(name), student:students!payments_school_id_student_id_fkey(id, first_name, last_name, matricule), payment_allocations(amount, is_active, invoice:invoices!payment_allocations_school_id_invoice_id_fkey(id, number, total, balance))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function setReconciled(ctx: AppContext, ids: string[], reconciled: boolean) {
  assertCan(ctx, "payments.validate", ["school"]);
  const { error } = await ctx.db
    .from("payments")
    .update({ reconciled, reconciled_at: reconciled ? new Date().toISOString() : null, reconciled_by: reconciled ? ctx.user.id : null })
    .in("id", ids)
    .eq("school_id", ctx.school.id)
    .eq("status", "completed");
  if (error) throw fromDbError(error);
}

export async function reversePayment(ctx: AppContext, id: string, reason: string) {
  assertCan(ctx, "payments.validate", ["school"]);
  const { error } = await ctx.db.rpc("reverse_payment", { p_payment: id, p_reason: reason });
  if (error) throw fromDbError(error);
}

export async function refundPayment(ctx: AppContext, id: string, amount: number, reason: string) {
  assertCan(ctx, "payments.validate", ["school"]);
  const { error } = await ctx.db.rpc("refund_payment", { p_payment: id, p_amount: amount, p_reason: reason });
  if (error) throw fromDbError(error);
}

export async function financeSettings(ctx: AppContext) {
  assertCan(ctx, "finance.read");
  const s = ctx.school.id;
  const [feeTypes, schedules, discounts, methods, categories, suppliers, levels, years] = await Promise.all([
    ctx.db.from("fee_types").select("id, name, category, is_active").eq("school_id", s).order("name"),
    ctx.db
      .from("fee_schedules")
      .select("id, amount, installments, academic_year_id, fee_type:fee_types!fee_schedules_school_id_fee_type_id_fkey(id, name, category), level:levels!fee_schedules_school_id_level_id_fkey(id, name, position)")
      .eq("school_id", s),
    ctx.db.from("discounts").select("id, name, kind, value, is_scholarship, applies_to_category, is_active").eq("school_id", s).order("name"),
    ctx.db.from("payment_methods").select("id, name, kind, requires_reference, is_active").eq("school_id", s).order("name"),
    ctx.db.from("expense_categories").select("id, name").eq("school_id", s).order("name"),
    ctx.db.from("suppliers").select("id, name, contact_name, phone, email, is_active").eq("school_id", s).order("name"),
    ctx.db.from("levels").select("id, name, position").eq("school_id", s).order("position"),
    ctx.db.from("academic_years").select("id, name, is_current").eq("school_id", s).order("starts_on", { ascending: false }),
  ]);
  return {
    feeTypes: feeTypes.data ?? [],
    schedules: schedules.data ?? [],
    discounts: discounts.data ?? [],
    methods: methods.data ?? [],
    categories: categories.data ?? [],
    suppliers: suppliers.data ?? [],
    levels: levels.data ?? [],
    years: years.data ?? [],
  };
}

export const feeScheduleSchema = z.object({
  academic_year_id: z.uuid(),
  fee_type_id: z.uuid(),
  level_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  amount: z.coerce.number().min(0).max(1e10),
  installments: z
    .array(z.object({ due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), percent: z.coerce.number().positive().max(100) }))
    .max(12)
    .default([])
    .refine((l) => l.length === 0 || Math.abs(l.reduce((s, x) => s + x.percent, 0) - 100) < 0.01, "Les pourcentages doivent totaliser 100 %"),
});

export async function saveFeeSchedule(ctx: AppContext, input: z.infer<typeof feeScheduleSchema>) {
  assertCan(ctx, "finance.manage", ["school"]);
  const { error } = await ctx.db.from("fee_schedules").insert({
    school_id: ctx.school.id,
    academic_year_id: input.academic_year_id,
    fee_type_id: input.fee_type_id,
    level_id: input.level_id ?? null,
    amount: input.amount,
    installments: input.installments,
  });
  if (error) throw fromDbError(error);
}

export async function saveSimple(
  ctx: AppContext,
  table: "fee_types" | "discounts" | "payment_methods" | "expense_categories" | "suppliers",
  row: Record<string, unknown>,
) {
  assertCan(ctx, table === "suppliers" ? "expenses.create" : "finance.manage", ["school"]);
  const { error } = await ctx.db.from(table).insert({ ...row, school_id: ctx.school.id } as never);
  if (error) throw fromDbError(error);
}

export async function grantDiscount(ctx: AppContext, studentId: string, discountId: string, reason?: string) {
  assertCan(ctx, "finance.manage", ["school"]);
  const { data: year } = await ctx.db.from("academic_years").select("id").eq("school_id", ctx.school.id).eq("is_current", true).maybeSingle();
  if (!year) throw new AppError("VALIDATION", "Aucune année scolaire en cours.");
  const { error } = await ctx.db.from("student_discounts").insert({
    school_id: ctx.school.id,
    student_id: studentId,
    discount_id: discountId,
    academic_year_id: year.id,
    reason: reason ?? null,
  });
  if (error) throw fromDbError(error);
}

export async function listExpenses(ctx: AppContext) {
  assertCan(ctx, "expenses.read");
  return unwrapList(
    await ctx.db
      .from("expenses")
      .select("id, description, amount, spent_on, status, reference, category:expense_categories!expenses_school_id_category_id_fkey(name), supplier:suppliers!expenses_school_id_supplier_id_fkey(name)")
      .eq("school_id", ctx.school.id)
      .order("spent_on", { ascending: false })
      .limit(200),
  );
}

export async function createExpense(ctx: AppContext, input: z.infer<typeof expenseSchema>) {
  assertCan(ctx, "expenses.create", ["school"]);
  const { data: year } = await ctx.db.from("academic_years").select("id").eq("school_id", ctx.school.id).eq("is_current", true).maybeSingle();
  const { error } = await ctx.db.from("expenses").insert({
    school_id: ctx.school.id,
    category_id: input.category_id,
    supplier_id: input.supplier_id ?? null,
    academic_year_id: year?.id ?? null,
    description: input.description,
    amount: input.amount,
    spent_on: input.spent_on,
    method_id: input.method_id ?? null,
    reference: input.reference ?? null,
    requested_by: ctx.user.id,
  });
  if (error) throw fromDbError(error);
}

export async function setExpenseStatus(ctx: AppContext, id: string, status: "approved" | "rejected" | "paid") {
  assertCan(ctx, "expenses.validate", ["school"]);
  const { data: e } = await ctx.db.from("expenses").select("status, requested_by").eq("id", id).maybeSingle();
  if (!e) throw new AppError("NOT_FOUND");
  const allowed: Record<string, string[]> = { pending: ["approved", "rejected"], approved: ["paid"] };
  if (!allowed[e.status]?.includes(status)) throw new AppError("INVALID_TRANSITION");
  if (status === "approved" && e.requested_by === ctx.user.id && !canSchoolWide(ctx, "school.manage")) {
    throw new AppError("FORBIDDEN", "Une dépense ne peut pas être approuvée par la personne qui l'a saisie.");
  }
  unwrap(
    await ctx.db
      .from("expenses")
      .update({ status, approved_by: status === "approved" ? ctx.user.id : undefined, approved_at: status === "approved" ? new Date().toISOString() : undefined })
      .eq("id", id)
      .select("id")
      .single(),
  );
}

export async function saveBudget(ctx: AppContext, yearId: string, categoryId: string, amount: number) {
  assertCan(ctx, "budgets.manage", ["school"]);
  const { error } = await ctx.db
    .from("budgets")
    .upsert({ school_id: ctx.school.id, academic_year_id: yearId, category_id: categoryId, amount }, { onConflict: "academic_year_id,category_id" });
  if (error) throw fromDbError(error);
}

/** Invoices and payments of the family's children (RLS `linked` / `self`). */
export async function familyFinance(ctx: AppContext) {
  assertCan(ctx, "finance.read");
  const [invoices, payments] = await Promise.all([
    ctx.db
      .from("invoices")
      .select("id, number, due_date, total, amount_paid, balance, status, student:students!invoices_school_id_student_id_fkey(first_name, last_name), invoice_installments(due_on, amount)")
      .neq("status", "cancelled")
      .order("due_date"),
    ctx.db
      .from("payments")
      .select("id, receipt_number, amount, paid_at, status, method:payment_methods!payments_school_id_method_id_fkey(name), student:students!payments_school_id_student_id_fkey(first_name, last_name)")
      .order("paid_at", { ascending: false })
      .limit(50),
  ]);
  return { invoices: unwrapList(invoices), payments: unwrapList(payments) };
}
