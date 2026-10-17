"use client";

import { FileUpIcon } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/form-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { isoDate } from "@/lib/utils";
import { submitJustificationAction } from "./actions";

export function JustificationForm({ students }: { students: { id: string; name: string }[] }) {
  const [state, action] = useActionState(submitJustificationAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      ref.current?.reset();
    } else toast.error(state.error);
  }, [state]);
  const today = isoDate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Justifier une absence</CardTitle>
        <CardDescription>Le justificatif est examiné par la vie scolaire. Les absences acceptées sont marquées comme justifiées.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
          {students.length > 1 ? (
            <Field label="Enfant" htmlFor="j-student" className="sm:col-span-2">
              <Select id="j-student" name="student_id" required>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="student_id" value={students[0]?.id} />
          )}
          <Field label="Du" htmlFor="j-from">
            <Input id="j-from" name="from_date" type="date" max={today} defaultValue={today} required />
          </Field>
          <Field label="Au" htmlFor="j-to">
            <Input id="j-to" name="to_date" type="date" defaultValue={today} required />
          </Field>
          <Field label="Motif" htmlFor="j-reason" className="sm:col-span-2">
            <Textarea id="j-reason" name="reason" required minLength={3} maxLength={1000} placeholder="Consultation médicale, raison familiale…" />
          </Field>
          <Field label="Pièce justificative (facultatif)" htmlFor="j-file" className="sm:col-span-2" hint="PDF ou photo, 10 Mo maximum.">
            <Input id="j-file" name="file" type="file" accept="application/pdf,image/*" capture="environment" className="pt-1.5" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Envoi…">
              <FileUpIcon /> Envoyer le justificatif
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
