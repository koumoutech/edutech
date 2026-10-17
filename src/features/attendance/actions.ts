"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import { storeDocument } from "@/server/services/documents";
import {
  justificationSchema,
  reviewJustification,
  saveAttendance,
  saveAttendanceSchema,
  submitJustification,
} from "@/server/services/attendance";

export async function saveAttendanceAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    await saveAttendance(ctx, parseInput(saveAttendanceSchema, input as Record<string, unknown>));
    refresh();
  }, "Appel enregistré. Les familles des élèves absents sont prévenues.");
}

export async function submitJustificationAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const input = parseInput(justificationSchema, fd);
    let documentId: string | undefined;
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      documentId = await storeDocument(ctx, {
        file,
        title: `Justificatif du ${input.from_date}`,
        category: "justification",
        studentId: input.student_id,
        visibleToFamily: true,
      });
    }
    await submitJustification(ctx, input, documentId);
    refresh();
  }, "Justificatif transmis à l'établissement.");
}

export async function reviewJustificationAction(id: string, status: string, comment: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const p = parseInput(
      z.object({ id: z.uuid(), status: z.enum(["accepted", "rejected"]), comment: z.string().max(500).optional() }),
      {
        id,
        status,
        comment: comment || undefined,
      },
    );
    await reviewJustification(ctx, p.id, p.status, p.comment);
    refresh();
  }, "Décision enregistrée.");
}
