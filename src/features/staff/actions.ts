"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import {
  addContract,
  addEvaluation,
  cancelLeave,
  contractSchema,
  evaluationSchema,
  leaveSchema,
  requestLeave,
  reviewLeave,
  saveStaff,
  staffSchema,
} from "@/server/services/staff";

export async function saveStaffAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const id = await saveStaff(ctx, parseInput(staffSchema, fd));
    refresh();
    return { id };
  }, "Fiche enregistrée.");
}

export async function addContractAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await addContract(ctx, parseInput(contractSchema, fd));
    refresh();
  }, "Contrat ajouté.");
}

export async function addEvaluationAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await addEvaluation(ctx, parseInput(evaluationSchema, fd));
    refresh();
  }, "Évaluation enregistrée.");
}

export async function requestLeaveAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await requestLeave(ctx, parseInput(leaveSchema, fd));
    refresh();
  }, "Demande envoyée pour validation.");
}

export async function reviewLeaveAction(id: string, status: string, comment: string, fd?: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(
      z.object({ id: z.uuid(), status: z.enum(["approved", "rejected"]), comment: z.string().max(500).optional(), substitute: z.uuid().optional() }),
      { id, status, comment: comment || undefined, substitute: (fd?.get("substitute_staff_id") as string) || undefined },
    );
    await reviewLeave(ctx, v.id, v.status, v.comment, v.substitute);
    refresh();
  }, "Décision enregistrée : la personne est notifiée.");
}

export async function cancelLeaveAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await cancelLeave(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Demande annulée.");
}
