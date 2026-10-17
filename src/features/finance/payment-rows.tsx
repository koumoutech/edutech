"use client";

import { CheckIcon, FileDownIcon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { reconcileAction, refundPaymentAction, reversePaymentAction } from "./actions";

interface PaymentRow {
  id: string;
  receipt: string;
  student: string;
  amount: number;
  paidAt: string;
  method: string;
  reference: string | null;
  status: string;
  reconciled: boolean;
}

export function PaymentRows({
  rows,
  currency,
  canValidate,
}: {
  rows: PaymentRow[];
  currency: string;
  canValidate: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const reconcile = (value: boolean) =>
    start(async () => {
      const res = await reconcileAction([...selected], value);
      if (res.ok) {
        toast.success(res.message);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <>
      {canValidate && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <p className="text-muted-foreground mr-auto text-sm">{selected.size} sélectionné(s)</p>
          <Button size="sm" variant="outline" disabled={!selected.size || pending} onClick={() => reconcile(true)}>
            <CheckIcon /> Marquer rapprochés
          </Button>
          <Button size="sm" variant="ghost" disabled={!selected.size || pending} onClick={() => reconcile(false)}>
            <Undo2Icon /> Annuler le rapprochement
          </Button>
        </div>
      )}
      <Table>
        <THead>
          <TR>
            {canValidate && <TH className="w-8" />}
            <TH>Reçu</TH>
            <TH>Élève</TH>
            <TH className="hidden md:table-cell">Date</TH>
            <TH className="hidden sm:table-cell">Mode / référence</TH>
            <TH className="text-right">Montant</TH>
            <TH>État</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((p) => (
            <TR key={p.id}>
              {canValidate && (
                <TD>
                  {p.status === "completed" && (
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${p.receipt}`}
                      className="size-4 accent-[var(--primary)]"
                      checked={selected.has(p.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                    />
                  )}
                </TD>
              )}
              <TD className="font-medium">{p.receipt}</TD>
              <TD>{p.student}</TD>
              <TD className="hidden md:table-cell">{formatDateTime(p.paidAt)}</TD>
              <TD className="hidden sm:table-cell">
                {p.method}
                {p.reference && <span className="text-muted-foreground block font-mono text-xs">{p.reference}</span>}
              </TD>
              <TD className="text-right font-semibold tabular-nums">{formatMoney(p.amount, currency)}</TD>
              <TD>
                {p.status === "reversed" ? (
                  <Badge variant="muted">Annulé</Badge>
                ) : p.reconciled ? (
                  <Badge>Rapproché</Badge>
                ) : (
                  <Badge variant="warning">À rapprocher</Badge>
                )}
              </TD>
              <TD className="text-right whitespace-nowrap">
                <Button asChild variant="ghost" size="icon-sm">
                  <a href={`/api/receipts/${p.id}`} target="_blank" rel="noopener" aria-label={`Reçu ${p.receipt}`}>
                    <FileDownIcon />
                  </a>
                </Button>
                {canValidate && p.status === "completed" && (
                  <>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label="Rembourser">
                          <RotateCcwIcon />
                        </Button>
                      }
                      title={`Remboursement — ${p.receipt}`}
                      description="Le montant remboursé est retiré des factures (les plus récentes d'abord). Opération tracée."
                      confirmLabel="Rembourser"
                      reason={{ label: "Motif du remboursement" }}
                      action={(reason, fd) => refundPaymentAction(p.id, reason, fd)}
                    >
                      <Field label={`Montant (max. ${formatMoney(p.amount, currency)})`} htmlFor={`rf-${p.id}`}>
                        <Input
                          id={`rf-${p.id}`}
                          name="amount"
                          type="number"
                          min={1}
                          max={p.amount}
                          step="any"
                          defaultValue={p.amount}
                          required
                        />
                      </Field>
                    </ConfirmDialog>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="text-destructive">
                          Annuler
                        </Button>
                      }
                      title={`Annuler le paiement ${p.receipt} ?`}
                      description="À utiliser pour une erreur de saisie : toutes les affectations sont libérées. Le reçu reste conservé avec la mention ANNULÉ."
                      tone="destructive"
                      confirmLabel="Annuler le paiement"
                      reason={{ label: "Motif de l'annulation" }}
                      action={(reason) => reversePaymentAction(p.id, reason)}
                    />
                  </>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
