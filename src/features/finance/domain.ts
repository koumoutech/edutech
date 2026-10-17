/**
 * Finance rules (pure, unit-tested). The database remains the source of truth:
 * these helpers power previews and validations in the interface, and mirror the
 * SQL logic of `record_payment` / `generate_class_invoices`.
 */

export interface OpenInvoice {
  id: string;
  number: string;
  due_date: string;
  issue_date: string;
  balance: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Oldest-due-first allocation plan. `rest` > 0 means the amount exceeds what is owed. */
export function planAllocation(
  amount: number,
  invoices: OpenInvoice[],
): { allocations: { invoice_id: string; amount: number }[]; rest: number } {
  let remaining = round2(amount);
  const allocations: { invoice_id: string; amount: number }[] = [];
  const sorted = [...invoices]
    .filter((i) => i.balance > 0)
    .sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) ||
        a.issue_date.localeCompare(b.issue_date) ||
        a.number.localeCompare(b.number),
    );
  for (const inv of sorted) {
    if (remaining <= 0) break;
    const part = round2(Math.min(inv.balance, remaining));
    allocations.push({ invoice_id: inv.id, amount: part });
    remaining = round2(remaining - part);
  }
  return { allocations, rest: remaining };
}

export function validateAllocations(
  amount: number,
  allocations: { invoice_id: string; amount: number }[],
  invoices: OpenInvoice[],
): string | null {
  if (!(amount > 0)) return "Le montant doit être positif.";
  const byId = new Map(invoices.map((i) => [i.id, i]));
  let total = 0;
  for (const a of allocations) {
    const inv = byId.get(a.invoice_id);
    if (!inv) return "Facture inconnue ou non payable.";
    if (!(a.amount > 0)) return "Chaque montant affecté doit être positif.";
    if (round2(a.amount) > round2(inv.balance)) return `Le montant affecté à ${inv.number} dépasse son solde.`;
    total = round2(total + a.amount);
  }
  if (total !== round2(amount)) return "La somme affectée doit être égale au montant encaissé.";
  return null;
}

export type DiscountRule = { kind: "percent" | "fixed"; value: number; applies_to_category: string | null };

/** Discount for one fee line (capped at the line amount). */
export function lineDiscount(amount: number, category: string, discounts: DiscountRule[]): number {
  const total = discounts
    .filter((d) => d.applies_to_category === null || d.applies_to_category === category)
    .reduce((s, d) => s + (d.kind === "percent" ? round2((amount * d.value) / 100) : d.value), 0);
  return round2(Math.min(amount, total));
}

/** Splits a total into installments from percentages; rounding remainder goes to the last one. */
export function splitInstallments(
  total: number,
  plan: { due_on: string; percent: number }[],
): { due_on: string; amount: number }[] {
  if (!plan.length) return [];
  const sum = plan.reduce((s, p) => s + p.percent, 0);
  if (Math.abs(sum - 100) > 0.001) throw new Error("Les pourcentages de l'échéancier doivent totaliser 100 %.");
  const out = plan.map((p) => ({ due_on: p.due_on, amount: round2((total * p.percent) / 100) }));
  const diff = round2(total - out.reduce((s, x) => s + x.amount, 0));
  out[out.length - 1].amount = round2(out[out.length - 1].amount + diff);
  return out;
}

export function isOverdue(inv: { status: string; due_date: string; balance: number }, today: string): boolean {
  return (inv.status === "issued" || inv.status === "partially_paid") && inv.balance > 0 && inv.due_date < today;
}

export function recoveryRate(billed: number, collected: number): number | null {
  return billed > 0 ? collected / billed : null;
}
