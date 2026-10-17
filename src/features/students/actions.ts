"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createStudentSchema, guardianFieldsSchema, updateStudentSchema } from "@/schemas/students";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import {
  addGuardian,
  archiveStudent,
  createStudent,
  enrollStudent,
  importContext,
  importStudents,
  unlinkGuardian,
  updateStudent,
  withdrawStudent,
} from "@/server/services/students";
import { validateStudentImport } from "./import";

export async function createStudentAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    const data = parseInput(createStudentSchema, input as Record<string, unknown>);
    return { id: await createStudent(ctx, data) };
  }, "Élève inscrit avec succès.");
}

export async function updateStudentAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    await updateStudent(ctx, parseInput(updateStudentSchema, input as Record<string, unknown>));
    refresh();
  }, "Dossier mis à jour.");
}

export async function enrollStudentAction(studentId: string, classId: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const p = parseInput(z.object({ studentId: z.uuid(), classId: z.uuid() }), { studentId, classId });
    await enrollStudent(ctx, p.studentId, p.classId);
    refresh();
  }, "Affectation enregistrée.");
}

export async function withdrawStudentAction(studentId: string, status: string, reason: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const p = parseInput(
      z.object({
        studentId: z.uuid(),
        status: z.enum(["transferred", "withdrawn", "graduated"]),
        reason: z.string().trim().min(3).max(500),
      }),
      { studentId, status, reason },
    );
    await withdrawStudent(ctx, p.studentId, p.status, p.reason);
    refresh();
  }, "Départ enregistré.");
}

export async function archiveStudentAction(studentId: string, reason: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const p = parseInput(
      z.object({ studentId: z.uuid(), reason: z.string().trim().min(5, "Motif requis (5 caractères min.)").max(500) }),
      { studentId, reason },
    );
    await archiveStudent(ctx, p.studentId, p.reason);
    refresh();
  }, "Dossier archivé.");
}

export async function addGuardianAction(studentId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    const id = parseInput(z.object({ id: z.uuid() }), { id: studentId }).id;
    const g = parseInput(guardianFieldsSchema, input as Record<string, unknown>);
    await addGuardian(ctx, id, g);
    refresh();
  }, "Responsable ajouté.");
}

export async function unlinkGuardianAction(studentId: string, guardianId: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const p = parseInput(z.object({ s: z.uuid(), g: z.uuid() }), { s: studentId, g: guardianId });
    await unlinkGuardian(ctx, p.s, p.g);
    refresh();
  }, "Rattachement supprimé.");
}

const MAX_CSV_BYTES = 2 * 1024 * 1024;

async function readCsv(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Sélectionnez un fichier CSV.");
  if (file.size > MAX_CSV_BYTES) throw new AppError("VALIDATION", "Fichier trop volumineux (2 Mo maximum).");
  if (!/\.csv$/i.test(file.name) && !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.type)) {
    throw new AppError("VALIDATION", "Le fichier doit être au format CSV.");
  }
  return file.text();
}

/** Step 1: validate the whole file and return a preview (nothing is written). */
export async function previewImportAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const text = await readCsv(formData);
    const ictx = await importContext(ctx);
    const preview = validateStudentImport(text, ictx);
    return { ...preview, csv: preview.errors.length === 0 ? text : null };
  });
}

/** Step 2: re-validate server-side (never trust the preview) and import. */
export async function confirmImportAction(csv: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    if (typeof csv !== "string" || csv.length > MAX_CSV_BYTES) throw new AppError("VALIDATION");
    const preview = validateStudentImport(csv, await importContext(ctx));
    if (preview.errors.length)
      throw new AppError("VALIDATION", "Le fichier contient des erreurs : corrigez-les puis recommencez.");
    const results = await importStudents(ctx, preview.rows);
    refresh();
    return { imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
  });
}
