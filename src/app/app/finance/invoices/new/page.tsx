import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { InvoiceForm } from "@/features/finance/invoice-form";
import { fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("invoices.create", ["school"]);
  const sp = await searchParams;
  const [students, feeTypes] = await Promise.all([
    ctx.db
      .from("students")
      .select("id, first_name, last_name, matricule")
      .eq("school_id", ctx.school.id)
      .eq("status", "active")
      .order("last_name")
      .limit(2000),
    ctx.db.from("fee_types").select("id, name").eq("school_id", ctx.school.id).eq("is_active", true).order("name"),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Nouvelle facture"
        description="Facture individuelle (frais complémentaires, régularisation…)."
      />
      <InvoiceForm
        students={(students.data ?? []).map((s) => ({ id: s.id, label: `${fullName(s)} — ${s.matricule}` }))}
        feeTypes={feeTypes.data ?? []}
        currency={ctx.school.currency}
        defaultStudentId={sp.student}
      />
    </div>
  );
}
