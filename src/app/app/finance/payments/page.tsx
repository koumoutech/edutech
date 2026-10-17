import { SearchIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { PaymentForm } from "@/features/finance/payment-form";
import { PaymentRows } from "@/features/finance/payment-rows";
import { canSchoolWide } from "@/lib/authz";
import { fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { INVOICES_PAGE_SIZE, listPayments, openInvoicesOf, paymentListSchema } from "@/server/services/finance";
import { z } from "zod";

export const metadata: Metadata = { title: "Paiements" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("finance.read", ["school"]);
  const sp = await searchParams;
  const query = paymentListSchema.parse(sp);
  const { rows, total } = await listPayments(ctx, query);
  const canCollect = canSchoolWide(ctx, "payments.create");
  const studentId = z.uuid().safeParse(sp.student).success ? sp.student! : undefined;
  const search = (sp.q ?? "")
    .replace(/[%_,().*\\]/g, " ")
    .trim()
    .slice(0, 60);

  const [found, student, open, methods] = await Promise.all([
    canCollect && search
      ? ctx.db
          .from("students")
          .select("id, first_name, last_name, matricule")
          .eq("school_id", ctx.school.id)
          .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,matricule.ilike.%${search}%`)
          .limit(8)
      : null,
    studentId
      ? ctx.db.from("students").select("id, first_name, last_name, matricule").eq("id", studentId).maybeSingle()
      : null,
    studentId && canCollect ? openInvoicesOf(ctx, studentId) : [],
    canCollect
      ? ctx.db
          .from("payment_methods")
          .select("id, name, requires_reference")
          .eq("school_id", ctx.school.id)
          .eq("is_active", true)
          .order("name")
      : null,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Paiements" description="Encaissements, reçus, rapprochements et corrections tracées." />

      {canCollect && (
        <Card>
          <CardHeader>
            <CardTitle>Nouvel encaissement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" role="search">
              <label className="relative flex-1">
                <span className="sr-only">Rechercher un élève</span>
                <SearchIcon
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input name="q" defaultValue={search} placeholder="Nom ou matricule de l'élève…" className="pl-9" />
              </label>
              <Button type="submit" variant="secondary">
                Rechercher
              </Button>
            </form>
            {found?.data && (
              <ul className="flex flex-wrap gap-2">
                {found.data.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/app/finance/payments?student=${s.id}`}
                      className="hover:bg-muted inline-block rounded-full border px-3 py-1 text-sm"
                    >
                      {fullName(s)} · {s.matricule}
                    </Link>
                  </li>
                ))}
                {found.data.length === 0 && <li className="text-muted-foreground text-sm">Aucun élève trouvé.</li>}
              </ul>
            )}
            {student?.data && (
              <div className="space-y-2">
                <p className="text-sm">
                  Élève : <strong>{fullName(student.data)}</strong> ({student.data.matricule})
                </p>
                <PaymentForm
                  studentId={student.data.id}
                  invoices={open.map((o) => ({ ...o, balance: Number(o.balance) }))}
                  methods={methods?.data ?? []}
                  currency={ctx.school.currency}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {[
          ["all", "Tous"],
          ["unreconciled", "À rapprocher"],
          ["reversed", "Annulés"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={`/app/finance/payments?filter=${k}`}
            className={`rounded-full border px-3 py-1 text-sm ${query.filter === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={WalletIcon} title="Aucun paiement" />
      ) : (
        <Card className="overflow-hidden">
          <PaymentRows
            currency={ctx.school.currency}
            canValidate={canSchoolWide(ctx, "payments.validate")}
            rows={rows.map((p) => ({
              id: p.id,
              receipt: p.receipt_number,
              student: fullName(p.student),
              amount: Number(p.amount),
              paidAt: p.paid_at,
              method: p.method?.name ?? "",
              reference: p.reference,
              status: p.status,
              reconciled: p.reconciled,
            }))}
          />
          <div className="border-t px-4 pb-4">
            <Pagination
              page={query.page}
              pageSize={INVOICES_PAGE_SIZE}
              total={total}
              basePath="/app/finance/payments"
              params={{ filter: query.filter }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
