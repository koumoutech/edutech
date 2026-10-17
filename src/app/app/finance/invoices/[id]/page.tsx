import { BanIcon, SendIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmDialog } from "@/components/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cancelInvoiceAction, issueInvoiceAction } from "@/features/finance/actions";
import { INVOICE_STATUS } from "@/features/finance/labels";
import { PaymentForm } from "@/features/finance/payment-form";
import { canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { getInvoice, openInvoicesOf } from "@/server/services/finance";

export const metadata: Metadata = { title: "Facture" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("finance.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const inv = await getInvoice(ctx, id).catch(() => null);
  if (!inv) notFound();
  const cur = inv.currency;
  const canPay = canSchoolWide(ctx, "payments.create") && ["issued", "partially_paid"].includes(inv.status) && Number(inv.balance) > 0;
  const [open, methods] = canPay
    ? await Promise.all([
        openInvoicesOf(ctx, inv.student_id),
        ctx.db.from("payment_methods").select("id, name, requires_reference").eq("school_id", ctx.school.id).eq("is_active", true).order("name"),
      ])
    : [[], null];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Facture"
        title={inv.number}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={INVOICE_STATUS[inv.status]?.variant}>{INVOICE_STATUS[inv.status]?.label}</Badge>
            <Link href={`/app/students/${inv.student?.id}`} className="hover:text-primary">
              {fullName(inv.student)} ({inv.student?.matricule})
            </Link>
            <span>· émise le {formatDate(inv.issue_date)} · échéance {formatDate(inv.due_date)}</span>
          </span>
        }
        actions={
          <>
            {inv.status === "draft" && canSchoolWide(ctx, "invoices.create") && (
              <ConfirmDialog
                trigger={
                  <Button size="sm">
                    <SendIcon /> Émettre
                  </Button>
                }
                title="Émettre la facture ?"
                description="Elle ne pourra plus être modifiée et la famille sera notifiée."
                action={issueInvoiceAction.bind(null, inv.id)}
              />
            )}
            {inv.status !== "cancelled" && Number(inv.amount_paid) === 0 && canSchoolWide(ctx, "finance.manage") && (
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="ghost" className="text-destructive">
                    <BanIcon /> Annuler
                  </Button>
                }
                title="Annuler la facture"
                tone="destructive"
                confirmLabel="Annuler la facture"
                reason={{ label: "Motif de l'annulation" }}
                action={cancelInvoiceAction.bind(null, inv.id)}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Facturé", inv.total],
          ["Encaissé", inv.amount_paid],
          ["Reste dû", inv.balance],
        ].map(([k, v]) => (
          <Card key={k as string} className="p-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-lg font-bold tabular-nums sm:text-2xl">{formatMoney(Number(v), cur)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Détail</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Libellé</TH>
                  <TH className="text-right">Qté</TH>
                  <TH className="text-right">Prix</TH>
                  <TH className="text-right">Remise</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {[...(inv.invoice_lines ?? [])]
                  .sort((a, b) => a.position - b.position)
                  .map((l) => (
                    <TR key={l.id}>
                      <TD>{l.description}</TD>
                      <TD className="text-right tabular-nums">{l.quantity}</TD>
                      <TD className="text-right tabular-nums">{formatMoney(Number(l.unit_amount), cur)}</TD>
                      <TD className="text-right tabular-nums">{Number(l.discount_amount) ? `− ${formatMoney(Number(l.discount_amount), cur)}` : "—"}</TD>
                      <TD className="text-right font-semibold tabular-nums">{formatMoney(Number(l.line_total), cur)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
            {inv.notes && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">{inv.notes}</p>}
            {inv.cancelled_reason && <p className="mt-3 text-sm text-destructive">Annulée : {inv.cancelled_reason}</p>}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Paiements affectés</CardTitle>
          </CardHeader>
          <CardContent>
            {(inv.payment_allocations ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement.</p>
            ) : (
              <ul className="divide-y text-sm">
                {(inv.payment_allocations ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <a href={`/api/receipts/${a.payment?.id}`} target="_blank" rel="noopener" className="font-medium hover:text-primary">
                        {a.payment?.receipt_number}
                      </a>
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(a.payment?.paid_at)} · {a.payment?.method?.name}
                      </span>
                    </span>
                    <span className={a.is_active ? "font-semibold tabular-nums" : "text-muted-foreground line-through tabular-nums"}>{formatMoney(Number(a.amount), cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {canPay && methods && (
        <PaymentForm
          studentId={inv.student_id}
          invoices={open.map((o) => ({ ...o, balance: Number(o.balance) }))}
          methods={methods.data ?? []}
          currency={cur}
          presetInvoiceId={inv.id}
        />
      )}
    </div>
  );
}
