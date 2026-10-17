import { Suspense, type ReactNode } from "react";
import { FinanceNav } from "@/features/finance/finance-nav";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { requireContext } from "@/server/auth/session";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <Nav />
      </Suspense>
      {children}
    </div>
  );
}

async function Nav() {
  const ctx = await requireContext();
  if (isFamilyOnly(ctx.school.roles)) return null;
  const items = [
    { href: "/app/finance", label: "Vue d'ensemble", show: canSchoolWide(ctx, "finance.read") },
    { href: "/app/finance/invoices", label: "Factures", show: canSchoolWide(ctx, "finance.read") },
    { href: "/app/finance/payments", label: "Paiements", show: canSchoolWide(ctx, "finance.read") },
    {
      href: "/app/finance/expenses",
      label: "Dépenses & budgets",
      show: can(ctx, "expenses.read") || can(ctx, "budgets.manage"),
    },
    { href: "/app/finance/settings", label: "Frais & paramètres", show: canSchoolWide(ctx, "finance.read") },
  ].filter((i) => i.show);
  return items.length > 1 ? <FinanceNav items={items} /> : null;
}
