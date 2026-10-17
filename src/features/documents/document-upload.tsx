"use client";

import { UploadCloudIcon } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/form-status";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { uploadDocumentAction } from "./actions";

export function DocumentUpload({
  studentId,
  staffId,
  documentTypes = [],
  category = studentId ? "student_file" : "hr",
  allowFamilyVisibility = Boolean(studentId),
}: {
  studentId?: string;
  staffId?: string;
  documentTypes?: { id: string; name: string }[];
  category?: string;
  allowFamilyVisibility?: boolean;
}) {
  const [state, action] = useActionState(uploadDocumentAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    } else toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardContent className="pt-5">
        <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {studentId && <input type="hidden" name="student_id" value={studentId} />}
          {staffId && <input type="hidden" name="staff_id" value={staffId} />}
          <input type="hidden" name="category" value={category} />
          <Field label="Fichier (PDF, image — 10 Mo max.)" htmlFor="file">
            <Input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required className="pt-1.5" />
          </Field>
          {documentTypes.length > 0 ? (
            <Field label="Type de pièce" htmlFor="document_type_id">
              <Select id="document_type_id" name="document_type_id" defaultValue="">
                <option value="">Autre document</option>
                {documentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Titre" htmlFor="title">
              <Input id="title" name="title" />
            </Field>
          )}
          <SubmitButton pendingLabel="Envoi…">
            <UploadCloudIcon /> Téléverser
          </SubmitButton>
          {documentTypes.length > 0 && (
            <Field label="Titre (facultatif)" htmlFor="title" className="sm:col-span-2">
              <Input id="title" name="title" placeholder="Par défaut : nom du fichier" />
            </Field>
          )}
          {allowFamilyVisibility && (
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="visible_to_family" className="size-4 accent-[var(--primary)]" /> Visible par la famille
            </label>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
