"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { ACTIVE_SCHOOL_COOKIE, requireContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";

export async function switchSchool(schoolId: string) {
  return runAction(async () => {
    const { id } = parseInput(z.object({ id: z.uuid() }), { id: schoolId });
    const ctx = await requireContext();
    if (!ctx.schools.some((s) => s.id === id)) throw new AppError("FORBIDDEN");
    (await cookies()).set(ACTIVE_SCHOOL_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    await ctx.db.from("profiles").update({ last_school_id: id }).eq("id", ctx.user.id);
    refresh();
  });
}

export async function markNotificationsRead(ids?: string[]) {
  return runAction(async () => {
    const ctx = await requireContext();
    let query = ctx.db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", ctx.user.id)
      .is("read_at", null);
    if (ids?.length) {
      const parsed = parseInput(z.object({ ids: z.array(z.uuid()).max(200) }), { ids });
      query = query.in("id", parsed.ids);
    }
    const { error } = await query;
    if (error) throw new AppError("UNKNOWN");
    refresh();
  });
}
