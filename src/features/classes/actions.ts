"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { bellPeriodSchema, classSchema, classSubjectSchema, levelSchema, roomSchema, subjectSchema, termSchema, yearSchema } from "@/schemas/academics";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getCurrentYear } from "@/server/repositories/academic";
import {
  deleteClass,
  deleteClassSubject,
  saveBellPeriods,
  saveClass,
  saveClassSubject,
  saveLevel,
  saveRoom,
  saveSubject,
  saveYear,
  updateTerm,
} from "@/server/services/academics";

type FormAction = (prev: unknown, fd: FormData) => Promise<unknown>;

function formAction<S extends z.ZodType>(schema: S, run: (ctx: Awaited<ReturnType<typeof requireContext>>, data: z.infer<S>) => Promise<unknown>, message: string): FormAction {
  return async (_prev, fd) =>
    runAction(async () => {
      const ctx = await requireContext();
      await run(ctx, parseInput(schema, fd));
      refresh();
    }, message);
}

export async function saveYearAction(prev: unknown, fd: FormData) {
  return formAction(yearSchema, (ctx, d) => saveYear(ctx, { ...d, is_current: fd.get("is_current") === "on" }), "Année scolaire enregistrée.")(prev, fd);
}
export async function updateTermAction(prev: unknown, fd: FormData) {
  return formAction(termSchema, updateTerm, "Période mise à jour.")(prev, fd);
}
export async function saveLevelAction(prev: unknown, fd: FormData) {
  return formAction(levelSchema, saveLevel, "Niveau enregistré.")(prev, fd);
}
export async function saveSubjectAction(prev: unknown, fd: FormData) {
  return formAction(subjectSchema, saveSubject, "Matière enregistrée.")(prev, fd);
}
export async function saveRoomAction(prev: unknown, fd: FormData) {
  return formAction(roomSchema, saveRoom, "Salle enregistrée.")(prev, fd);
}
export async function saveClassAction(prev: unknown, fd: FormData) {
  return formAction(
    classSchema,
    async (ctx, d) => {
      const year = await getCurrentYear(ctx.db, ctx.school.id);
      if (!year) throw new AppError("VALIDATION", "Créez d'abord une année scolaire.");
      return saveClass(ctx, year.id, d);
    },
    "Classe enregistrée.",
  )(prev, fd);
}
export async function saveClassSubjectAction(prev: unknown, fd: FormData) {
  return formAction(classSubjectSchema, saveClassSubject, "Enseignement enregistré.")(prev, fd);
}

export async function deleteClassAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await deleteClass(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Classe supprimée.");
}

export async function deleteClassSubjectAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await deleteClassSubject(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Enseignement retiré.");
}

export async function saveBellPeriodsAction(periods: unknown) {
  return runAction(async () => {
    const ctx = await requireContext();
    const list = parseInput(z.object({ periods: z.array(bellPeriodSchema).max(20) }), { periods }).periods;
    await saveBellPeriods(ctx, list);
    refresh();
  }, "Horaires enregistrés.");
}
