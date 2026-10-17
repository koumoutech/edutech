import { ReceiptIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AccountantDashboard } from "@/features/dashboard/staff-roles";
import { INVOICE_STATUS } from "@/features/finance/labels";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, fullName, isoDate } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { familyFinance } from "@/server/services/finance";

export const metadata: Metadata = { title: "Finances" };

export default async function FinancePage() {
  const ctx = await requireContext();
  if (!can(ctx, "finance.read")) redirect("/app/forbidden");
  if (canSchoolWide(ctx, "finance.read")) return <AccountantDashboard ctx={ctx} />;

  const { invoices, payments } = await familyFinance(ctx);
  const cur = ctx.school.currency;
  const due = invoices.reduce((s, i) => s + Number(i.balance), 0);
  const total = invoices.reduce((s, i) => s + Number(i.total), 0);
  const today = isoDate();

  return (
    <div className="space-y-5">
      <PageHeader title="Frais de scolarité" description="Factures, échéances et paiements de vos enfants." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total facturé</p>
          <p className="text-2xl font-bold tabular-nums">{formatMoney(total, cur)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Déjà payé</p>
          <p className="text-2xl font-bold tabular-nums">{formatMoney(total - due, cur)}</p>
          <Progress className="mt-2" value={total ? ((total - due) / total) * 100 : 0} />
        </Card>
        <Card className="border-highlight/50 bg-highlight/10 p-4">
          <p className="text-sm text-muted-foreground">Reste à payer</p>
          <p className="text-2xl font-bold tabular-nums">{formatMoney(due, cur)}</p>
        </Card>
      </div>
      {invoices.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="Aucune facture" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Factures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoices.map((i) => (
              <div key={i.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{i.number}</p>
                  <Badge variant={INVOICE_STATUS[i.status]?.variant ?? "muted"}>{INVOICE_STATUS[i.status]?.label}</Badge>
                  {Number(i.balance) > 0 && i.due_date < today && <Badge variant="danger">Échéance dépassée</Badge>}
                  <span className="ml-auto text-sm text-muted-foreground">{fullName(i.student)}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Montant</p>
                    <p className="font-medium tabular-nums">{formatMoney(i.total, cur)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payé</p>
                    <p className="font-medium tabular-nums">{formatMoney(i.amount_paid, cur)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reste dû</p>
                    <p className="font-bold tabular-nums">{formatMoney(i.balance, cur)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Échéance : {formatDate(i.due_date)}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Les paiements se font auprès de la comptabilité de l&apos;établissement (espèces, Mobile Money, virement). Un reçu vous est remis pour chaque paiement.
            </p>
          </CardContent>
        </Card>
      )}
      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Paiements</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Reçu</TH>
                  <TH>Date</TH>
                  <TH>Mode</TH>
                  <TH className="text-right">Montant</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">{p.receipt_number}</TD>
                    <TD>{formatDate(p.paid_at)}</TD>
                    <TD>{p.method?.name}</TD>
                    <TD className="text-right tabular-nums">
                      {formatMoney(p.amount, cur)} {p.status === "reversed" && <Badge variant="muted">Annulé</Badge>}
                    </TD>
                    <TD className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/api/receipts/${p.id}`} target="_blank" rel="noopener">
                          <WalletIcon /> Reçu
                        </a>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
