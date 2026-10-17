"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/misc";
import { formatDate, formatMoney } from "@/lib/utils";
import { recordPaymentAction } from "./actions";
import { planAllocation, validateAllocations, type OpenInvoice } from "./domain";

export function PaymentForm({
  studentId,
  invoices,
  methods,
  currency,
  presetInvoiceId,
}: {
  studentId: string;
  invoices: OpenInvoice[];
  methods: { id: string; name: string; requires_reference: boolean }[];
  currency: string;
  presetInvoiceId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const preset = invoices.find((i) => i.id === presetInvoiceId);
  const [amount, setAmount] = useState<number>(preset?.balance ?? invoices.reduce((s, i) => s + i.balance, 0));
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"auto" | "manual">(preset ? "manual" : "auto");
  const [manual, setManual] = useState<Record<string, number>>(preset ? { [preset.id]: preset.balance } : {});

  const method = methods.find((m) => m.id === methodId);
  const plan = useMemo(() => planAllocation(amount || 0, invoices), [amount, invoices]);
  const allocations =
    mode === "auto"
      ? plan.allocations
      : Object.entries(manual)
          .filter(([, v]) => v > 0)
          .map(([invoice_id, v]) => ({ invoice_id, amount: v }));
  const error = mode === "auto" ? (plan.rest > 0 ? `Le montant dépasse le total dû de ${formatMoney(plan.rest, currency)}.` : amount > 0 ? null : "Montant invalide.") : validateAllocations(amount, allocations, invoices);
  const refMissing = Boolean(method?.requires_reference && !reference.trim());

  const submit = () =>
    start(async () => {
      const res = await recordPaymentAction({
        student_id: studentId,
        amount,
        method_id: methodId,
        reference: reference || undefined,
        payer_name: payer || undefined,
        notes: notes || undefined,
        allocations,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message, {
        action: { label: "Reçu PDF", onClick: () => window.open(`/api/receipts/${res.data.id}`, "_blank", "noopener") },
      });
      router.refresh();
      router.push(`/app/finance/payments`);
    });

  if (!invoices.length) return <Alert tone="info">Aucune facture ouverte pour cet élève.</Alert>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Encaisser un paiement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Montant (${currency})`} htmlFor="p-amount">
            <Input id="p-amount" type="number" inputMode="decimal" min={0} step="any" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="Mode de paiement" htmlFor="p-method">
            <Select id="p-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Référence de transaction${method?.requires_reference ? " *" : ""}`} htmlFor="p-ref" error={refMissing ? "Obligatoire pour ce mode de paiement" : undefined}>
            <Input id="p-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="N° Mobile Money, virement, chèque…" />
          </Field>
          <Field label="Payeur" htmlFor="p-payer">
            <Input id="p-payer" value={payer} onChange={(e) => setPayer(e.target.value)} maxLength={160} placeholder="Nom de la personne qui paie" />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Affectation aux factures</legend>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "auto"} onChange={() => setMode("auto")} className="accent-[var(--primary)]" /> Automatique (échéances les plus anciennes)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "manual"} onChange={() => setMode("manual")} className="accent-[var(--primary)]" /> Manuelle
            </label>
          </div>
          <ul className="divide-y rounded-xl border">
            {invoices.map((inv) => {
              const auto = plan.allocations.find((a) => a.invoice_id === inv.id)?.amount ?? 0;
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{inv.number}</p>
                    <p className="text-xs text-muted-foreground">
                      Échéance {formatDate(inv.due_date)} · reste dû {formatMoney(inv.balance, currency)}
                    </p>
                  </div>
                  {mode === "auto" ? (
                    <span className="font-semibold tabular-nums">{formatMoney(auto, currency)}</span>
                  ) : (
                    <Input
                      aria-label={`Montant affecté à ${inv.number}`}
                      type="number"
                      min={0}
                      max={inv.balance}
                      step="any"
                      value={manual[inv.id] ?? ""}
                      onChange={(e) => setManual((m) => ({ ...m, [inv.id]: Number(e.target.value) }))}
                      className="w-36 text-right"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <Field label="Note interne" htmlFor="p-notes">
          <Textarea id="p-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
        </Field>

        {error && <Alert tone="warning">{error}</Alert>}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || Boolean(error) || refMissing || !methodId}>
            {pending && <Loader2Icon className="animate-spin" />} Encaisser {formatMoney(amount || 0, currency)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
