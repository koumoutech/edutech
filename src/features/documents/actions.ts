"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { assertCan, requireContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { softDeleteDocument, storeDocument } from "@/server/services/documents";

const uploadSchema = z.object({
  title: z.string().trim().min(2).max(160),
  category: z.enum(["student_file", "justification", "certificate", "report_card", "receipt", "hr", "administrative", "other"]),
  student_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  staff_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  document_type_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  visible_to_family: z.literal("on").optional(),
});

export async function uploadDocumentAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Sélectionnez un fichier.");
    const input = parseInput(uploadSchema, {
      title: formData.get("title") || file.name,
      category: formData.get("category"),
      student_id: formData.get("student_id") ?? undefined,
      staff_id: formData.get("staff_id") ?? undefined,
      document_type_id: formData.get("document_type_id") ?? undefined,
      visible_to_family: formData.get("visible_to_family") ?? undefined,
    });
    await storeDocument(ctx, {
      file,
      title: input.title,
      category: input.category,
      studentId: input.student_id,
      staffId: input.staff_id,
      documentTypeId: input.document_type_id,
      visibleToFamily: Boolean(input.visible_to_family),
    });
    refresh();
  }, "Document enregistré.");
}

export async function deleteDocumentAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    assertCan(ctx, "documents.delete");
    await softDeleteDocument(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Document supprimé.");
}
