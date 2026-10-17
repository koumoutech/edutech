import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { can } from "@/lib/authz";
import { MAX_UPLOAD_BYTES, safeFileName, sniffMime } from "@/lib/files";
import type { AppContext } from "@/server/auth/session";
import { AppError, fromDbError } from "@/server/errors";

export type DocumentCategory =
  "student_file" | "justification" | "certificate" | "report_card" | "receipt" | "hr" | "administrative" | "other";

/**
 * Stores a file in the private `documents` bucket.
 * 1. validates size + real type (magic bytes),
 * 2. inserts the metadata row as the user (RLS decides if they may),
 * 3. uploads to a server-chosen path (storage policy requires the matching row).
 */
export async function storeDocument(
  ctx: AppContext,
  input: {
    file: File | { name: string; bytes: Uint8Array };
    title: string;
    category: DocumentCategory;
    studentId?: string;
    staffId?: string;
    documentTypeId?: string;
    visibleToFamily?: boolean;
  },
): Promise<string> {
  const bytes = input.file instanceof File ? new Uint8Array(await input.file.arrayBuffer()) : input.file.bytes;
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES)
    throw new AppError("VALIDATION", "Fichier vide ou trop volumineux (10 Mo maximum).");
  const mime = sniffMime(bytes);
  if (!mime) throw new AppError("VALIDATION", "Type de fichier non autorisé (PDF, PNG, JPEG ou WEBP uniquement).");

  const id = randomUUID();
  const path = `${ctx.school.id}/${id}/${safeFileName(input.file.name, mime)}`;
  const { error } = await ctx.db.from("documents").insert({
    id,
    school_id: ctx.school.id,
    category: input.category,
    title: input.title.slice(0, 160),
    student_id: input.studentId ?? null,
    staff_id: input.staffId ?? null,
    document_type_id: input.documentTypeId ?? null,
    storage_path: path,
    mime_type: mime,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    visible_to_family: input.visibleToFamily ?? false,
    uploaded_by: ctx.user.id,
  });
  if (error) throw fromDbError(error);

  const upload = await ctx.db.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) {
    if (can(ctx, "documents.delete")) {
      await ctx.db.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    }
    throw new AppError("UNKNOWN", "Le fichier n'a pas pu être enregistré. Réessayez.");
  }
  return id;
}

/** Short-lived signed URL after an RLS-checked metadata lookup. */
export async function signedDocumentUrl(ctx: AppContext, id: string): Promise<string> {
  const { data: doc } = await ctx.db
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc?.storage_path) throw new AppError("NOT_FOUND");
  const { data, error } = await ctx.db.storage.from("documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data) throw new AppError("NOT_FOUND");
  return data.signedUrl;
}

export async function softDeleteDocument(ctx: AppContext, id: string) {
  const { error } = await ctx.db
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("school_id", ctx.school.id);
  if (error) throw fromDbError(error);
}
