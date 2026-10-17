"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import {
  cancelInvoice,
  createExpense,
  createInvoice,
  createInvoiceSchema,
  expenseSchema,
  feeScheduleSchema,
  generateClassInvoices,
  grantDiscount,
  issueInvoice,
  paymentSchema,
  recordPayment,
  refundPayment,
  reversePayment,
  saveBudget,
  saveFeeSchedule,
  saveSimple,
  setExpenseStatus,
  setReconciled,
} from "@/server/services/finance";

const id = z.object({ id: z.uuid() });

export async function createInvoiceAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    const invoiceId = await createInvoice(ctx, parseInput(createInvoiceSchema, input as Record<string, unknown>));
    refresh();
    return { id: invoiceId };
  }, "Facture créée.");
}

export async function issueInvoiceAction(invoiceId: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await issueInvoice(ctx, parseInput(id, { id: invoiceId }).id);
    refresh();
  }, "Facture émise : la famille est notifiée.");
}

export async function cancelInvoiceAction(invoiceId: string, reason: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(id.extend({ reason: z.string().trim().min(5).max(500) }), { id: invoiceId, reason });
    await cancelInvoice(ctx, v.id, v.reason);
    refresh();
  }, "Facture annulée.");
}

export async function generateClassInvoicesAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(
      z.object({
        class_id: z.uuid(),
        schedules: z.array(z.uuid()).min(1, "Sélectionnez au moins un frais"),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        issue: z.literal("on").optional(),
      }),
      fd,
    );
    const n = await generateClassInvoices(ctx, v.class_id, v.schedules, v.due_date, Boolean(v.issue));
    refresh();
    return { created: n };
  }, "Factures générées pour la classe.");
}

export async function recordPaymentAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    const paymentId = await recordPayment(ctx, parseInput(paymentSchema, input as Record<string, unknown>));
    refresh();
    return { id: paymentId };
  }, "Paiement enregistré.");
}

export async function reconcileAction(ids: string[], reconciled: boolean) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ ids: z.array(z.uuid()).min(1).max(500), reconciled: z.boolean() }), { ids, reconciled });
    await setReconciled(ctx, v.ids, v.reconciled);
    refresh();
  }, reconciled ? "Paiements rapprochés." : "Rapprochement annulé.");
}

export async function reversePaymentAction(paymentId: string, reason: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(id.extend({ reason: z.string().trim().min(5).max(500) }), { id: paymentId, reason });
    await reversePayment(ctx, v.id, v.reason);
    refresh();
  }, "Paiement annulé : les factures concernées ont été réouvertes.");
}

export async function refundPaymentAction(paymentId: string, reason: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(id.extend({ reason: z.string().trim().min(5).max(500), amount: z.coerce.number().positive() }), {
      id: paymentId,
      reason,
      amount: fd.get("amount"),
    });
    await refundPayment(ctx, v.id, v.amount, v.reason);
    refresh();
  }, "Remboursement enregistré.");
}

export async function createExpenseAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await createExpense(ctx, parseInput(expenseSchema, fd));
    refresh();
  }, "Dépense enregistrée (en attente d'approbation).");
}

export async function setExpenseStatusAction(expenseId: string, status: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(id.extend({ status: z.enum(["approved", "rejected", "paid"]) }), { id: expenseId, status });
    await setExpenseStatus(ctx, v.id, v.status);
    refresh();
  }, "Dépense mise à jour.");
}

export async function saveBudgetAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ year_id: z.uuid(), category_id: z.uuid(), amount: z.coerce.number().min(0).max(1e11) }), fd);
    await saveBudget(ctx, v.year_id, v.category_id, v.amount);
    refresh();
  }, "Budget enregistré.");
}

export async function saveFeeScheduleAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const dues = fd.getAll("due_on").map(String);
    const percents = fd.getAll("percent").map(String);
    const installments = dues.map((d, i) => ({ due_on: d, percent: percents[i] })).filter((x) => x.due_on && x.percent);
    await saveFeeSchedule(
      ctx,
      parseInput(feeScheduleSchema, {
        academic_year_id: fd.get("academic_year_id"),
        fee_type_id: fd.get("fee_type_id"),
        level_id: fd.get("level_id") ?? "",
        amount: fd.get("amount"),
        installments,
      }),
    );
    refresh();
  }, "Frais enregistré.");
}

const simpleSchemas = {
  fee_types: z.object({
    name: z.string().trim().min(2).max(80),
    category: z.enum(["tuition", "registration", "exam", "transport", "canteen", "uniform", "supplies", "activity", "other"]),
  }),
  discounts: z.object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(["percent", "fixed"]),
    value: z.coerce.number().positive(),
    is_scholarship: z.literal("on").optional().transform((v) => v === "on"),
    applies_to_category: z.string().optional().transform((v) => v || null),
  }),
  payment_methods: z.object({
    name: z.string().trim().min(2).max(60),
    kind: z.enum(["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"]),
    requires_reference: z.literal("on").optional().transform((v) => v === "on"),
  }),
  expense_categories: z.object({ name: z.string().trim().min(2).max(80) }),
  suppliers: z.object({
    name: z.string().trim().min(2).max(120),
    contact_name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.email().optional().or(z.literal("").transform(() => undefined)),
  }),
} as const;

export async function saveSimpleAction(table: keyof typeof simpleSchemas, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    if (!(table in simpleSchemas)) throw new Error("invalid table");
    await saveSimple(ctx, table, parseInput(simpleSchemas[table], fd) as Record<string, unknown>);
    refresh();
  }, "Enregistré.");
}

export async function grantDiscountAction(studentId: string, _reason: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ student: z.uuid(), discount: z.uuid(), reason: z.string().max(300).optional() }), {
      student: studentId,
      discount: fd.get("discount_id"),
      reason: _reason || undefined,
    });
    await grantDiscount(ctx, v.student, v.discount, v.reason);
    refresh();
  }, "Réduction attribuée.");
}
