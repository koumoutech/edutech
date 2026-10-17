"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { getSessionUser } from "@/server/auth/session";
import { AppError, fromDbError } from "@/server/errors";
import { createClient } from "@/server/supabase/server";

export async function updateProfileAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED");
    const v = parseInput(
      z.object({
        full_name: z.string().trim().min(2).max(160),
        phone: z
          .string()
          .trim()
          .max(30)
          .regex(/^[+0-9 ().-]*$/, "Numéro invalide")
          .optional()
          .transform((p) => p || null),
      }),
      fd,
    );
    const db = await createClient();
    const { error } = await db.from("profiles").update(v).eq("id", user.id);
    if (error) throw fromDbError(error);
    refresh();
  }, "Profil mis à jour.");
}
