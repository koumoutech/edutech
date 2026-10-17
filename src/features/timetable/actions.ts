"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import { addEntry, addSubstitution, deleteEntry, entrySchema, substitutionSchema } from "@/server/services/timetable";

export async function addEntryAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await addEntry(ctx, parseInput(entrySchema, fd));
    refresh();
  }, "Créneau ajouté (aucun conflit détecté).");
}

export async function deleteEntryAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await deleteEntry(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Créneau supprimé.");
}

export async function addSubstitutionAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await addSubstitution(ctx, parseInput(substitutionSchema, fd));
    refresh();
  }, "Modification enregistrée : enseignants et familles sont notifiés.");
}
