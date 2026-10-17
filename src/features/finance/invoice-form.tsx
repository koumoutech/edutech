"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { formatMoney, isoDate } from "@/lib/utils";
import { createInvoiceAction } from "./actions";

interface Line {
  fee_type_id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  discount_amount: number;
}

export function InvoiceForm({
  students,
  feeTypes,
  currency,
  defaultStudentId,
}: {
  students: { id: string; label: string }[];
  feeTypes: { id: string; name: string }[];
  currency: string;
  defaultStudentId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const [studentId, setStudentId] = useState(defaultStudentId ?? "");
  const [dueDate, setDueDate] = useState(isoDate(in30));
  const [notes, setNotes] = useState("");
  const [issue, setIssue] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ fee_type_id: feeTypes[0]?.id ?? "", description: feeTypes[0]?.name ?? "", quantity: 1, unit_amount: 0, discount_amount: 0 }]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_amount - l.discount_amount, 0);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = () =>
    start(async () => {
      const res = await createInvoiceAction({ student_id: studentId, due_date: dueDate, notes: notes || undefined, issue, lines });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.push(`/app/finance/invoices/${res.data.id}`);
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <Field label="Élève" htmlFor="inv-student" className="sm:col-span-2">
            <Select id="inv-student" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="" disabled>
                Choisir un élève…
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Échéance" htmlFor="inv-due">
            <Input id="inv-due" type="date" min={isoDate()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={issue} onChange={(e) => setIssue(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Émettre immédiatement
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lignes</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLines((ls) => [...ls, { fee_type_id: "", description: "", quantity: 1, unit_amount: 0, discount_amount: 0 }])}
          >
            <PlusIcon /> Ligne
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1.2fr_1.6fr_0.6fr_1fr_1fr_auto] sm:items-end">
              <Field label="Type" htmlFor={`l${i}-type`}>
                <Select
                  id={`l${i}-type`}
                  value={l.fee_type_id}
                  onChange={(e) => update(i, { fee_type_id: e.target.value, description: l.description || feeTypes.find((f) => f.id === e.target.value)?.name || "" })}
                >
                  <option value="">Autre</option>
                  {feeTypes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Libellé" htmlFor={`l${i}-desc`}>
                <Input id={`l${i}-desc`} value={l.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={200} />
              </Field>
              <Field label="Qté" htmlFor={`l${i}-qty`}>
                <Input id={`l${i}-qty`} type="number" min={1} value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Prix unitaire" htmlFor={`l${i}-amt`}>
                <Input id={`l${i}-amt`} type="number" min={0} step="any" value={l.unit_amount} onChange={(e) => update(i, { unit_amount: Number(e.target.value) })} />
              </Field>
              <Field label="Remise" htmlFor={`l${i}-disc`}>
                <Input id={`l${i}-disc`} type="number" min={0} step="any" value={l.discount_amount} onChange={(e) => update(i, { discount_amount: Number(e.target.value) })} />
              </Field>
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label="Supprimer la ligne">
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Field label="Notes (visibles sur la facture)" htmlFor="inv-notes">
            <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
          </Field>
        </CardContent>
      </Card>
      <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 backdrop-blur lg:bottom-4">
        <p className="font-semibold">
          Total : <span className="tabular-nums">{formatMoney(total, currency)}</span>
        </p>
        <Button onClick={submit} disabled={pending || !studentId || total <= 0}>
          {pending && <Loader2Icon className="animate-spin" />} Créer la facture
        </Button>
      </div>
    </div>
  );
}
