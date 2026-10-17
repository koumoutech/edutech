"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import {
  assessmentSchema,
  correctGrade,
  deleteAssessment,
  generateReportCards,
  gradeEntrySchema,
  saveAppreciation,
  saveAssessment,
  saveGrades,
  setAssessmentStatus,
  setReportCardsStatus,
} from "@/server/services/assessments";

export async function saveAssessmentAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const id = await saveAssessment(ctx, parseInput(assessmentSchema, fd));
    refresh();
    return { id };
  }, "Évaluation enregistrée.");
}

export async function deleteAssessmentAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await deleteAssessment(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Évaluation supprimée.");
}

export async function saveGradesAction(input: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    await saveGrades(ctx, parseInput(gradeEntrySchema, input as Record<string, unknown>));
    refresh();
  }, "Notes enregistrées.");
}

const STATUS_MESSAGES: Record<string, string> = {
  draft: "Évaluation repassée en brouillon.",
  submitted: "Notes soumises pour validation.",
  validated: "Évaluation validée : les notes sont verrouillées.",
  published: "Résultats publiés : élèves et parents sont notifiés.",
};

export async function setAssessmentStatusAction(id: string, status: string) {
  const p = z.object({ id: z.uuid(), status: z.enum(["draft", "submitted", "validated", "published"]) }).safeParse({ id, status });
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ id: z.uuid(), status: z.enum(["draft", "submitted", "validated", "published"]) }), { id, status });
    await setAssessmentStatus(ctx, v.id, v.status);
    refresh();
  }, p.success ? STATUS_MESSAGES[p.data.status] : undefined);
}

export async function correctGradeAction(gradeId: string, reason: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const absent = fd.get("is_absent") === "on";
    const v = parseInput(
      z.object({
        gradeId: z.uuid(),
        reason: z.string().trim().min(5, "Motif obligatoire (5 caractères min.)").max(500),
        score: z.coerce.number().min(0).max(1000).nullable(),
      }),
      { gradeId, reason, score: absent ? null : fd.get("score") },
    );
    await correctGrade(ctx, v.gradeId, v.score, absent, v.reason);
    refresh();
  }, "Note corrigée. La modification est tracée dans l'historique.");
}

export async function generateReportCardsAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ class_id: z.uuid(), term_id: z.uuid() }), fd);
    const res = await generateReportCards(ctx, v.class_id, v.term_id);
    refresh();
    return res;
  }, "Bulletins générés (les bulletins déjà validés ne sont pas modifiés).");
}

export async function setReportCardsStatusAction(ids: string[], status: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ ids: z.array(z.uuid()).min(1).max(500), status: z.enum(["draft", "validated", "published"]) }), { ids, status });
    const n = await setReportCardsStatus(ctx, v.ids, v.status);
    refresh();
    return { updated: n };
  }, status === "published" ? "Bulletins publiés : familles notifiées." : "Statut des bulletins mis à jour.");
}

export async function saveAppreciationAction(id: string, _reason: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(
      z.object({ id: z.uuid(), appreciation: z.string().trim().max(1000), decision: z.string().trim().max(200).optional() }),
      { id, appreciation: fd.get("appreciation") ?? "", decision: fd.get("decision") ?? undefined },
    );
    await saveAppreciation(ctx, v.id, v.appreciation, v.decision);
    refresh();
  }, "Appréciation enregistrée.");
}
