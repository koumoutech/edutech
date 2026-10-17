"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { getSessionUser } from "@/server/auth/session";
import { AppError, fromDbError } from "@/server/errors";
import { PLATFORM_SETTINGS_TAG } from "@/server/platform";
import { createClient } from "@/server/supabase/server";

async function requirePlatformAdmin() {
  const user = await getSessionUser();
  if (!user || user.mfaPending) throw new AppError("UNAUTHENTICATED");
  const db = await createClient();
  const { data } = await db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) throw new AppError("FORBIDDEN");
  return { db, user };
}

export async function createSchoolAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const { db } = await requirePlatformAdmin();
    const v = parseInput(
      z.object({
        name: z.string().trim().min(2).max(160),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9-]{3,48}$/, "3 à 48 caractères : minuscules, chiffres, tirets"),
        country: z.string().trim().length(2).toUpperCase(),
        currency: z
          .string()
          .trim()
          .regex(/^[A-Z]{3}$/),
        timezone: z.string().trim().min(3).max(60),
        is_demo: z
          .literal("on")
          .optional()
          .transform((x) => x === "on"),
      }),
      fd,
    );
    const { error } = await db.rpc("create_school", {
      p_name: v.name,
      p_slug: v.slug,
      p_country: v.country,
      p_currency: v.currency,
      p_timezone: v.timezone,
      p_is_demo: v.is_demo,
    });
    if (error) throw fromDbError(error);
    refresh();
  }, "Établissement créé : vous en êtes administrateur et pouvez inviter son équipe.");
}

export async function updateBrandingAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const { db, user } = await requirePlatformAdmin();
    const v = parseInput(
      z.object({
        name: z.string().trim().min(2).max(40),
        tagline: z.string().trim().min(2).max(120),
        support_email: z.email(),
      }),
      fd,
    );
    for (const [key, value] of [
      ["product.name", v.name],
      ["product.tagline", v.tagline],
      ["product.support_email", v.support_email],
    ] as const) {
      const { error } = await db
        .from("platform_settings")
        .update({ value, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw fromDbError(error);
    }
    updateTag(PLATFORM_SETTINGS_TAG);
  }, "Identité de la plateforme mise à jour.");
}
