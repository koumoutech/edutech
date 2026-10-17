"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { consumeRateLimit, recordLoginEvent, resetRateLimit, safeNextPath } from "@/server/auth/security";
import { getSessionUser } from "@/server/auth/session";
import { AppError, type ActionResult } from "@/server/errors";
import { createClient } from "@/server/supabase/server";

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Saisissez les 6 chiffres affichés par votre application.");

/** 5 wrong codes per 5 minutes, then a 15-minute lock (per account). */
async function guardAttempts(userId: string) {
  if (!(await consumeRateLimit(`mfa:user:${userId}`, 5, 300, 900))) throw new AppError("RATE_LIMITED");
}

async function verifiedTotp(db: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await db.auth.mfa.listFactors();
  if (error) throw new AppError("UNKNOWN");
  return data.totp.filter((f) => f.status === "verified");
}

/** Login step 2: verifies the TOTP code and upgrades the session to aal2. */
export async function verifyMfaChallenge(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let next = "/app";
  const res = await runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED");
    next = safeNextPath(String(fd.get("next") ?? ""));
    const code = parseInput(z.object({ code: codeSchema }), fd).code;
    await guardAttempts(user.id);
    const db = await createClient();
    const [factor] = await verifiedTotp(db);
    if (!factor) return;
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      await recordLoginEvent("mfa_failure", { userId: user.id });
      throw new AppError("VALIDATION", "Code incorrect ou expiré.");
    }
    await resetRateLimit(`mfa:user:${user.id}`);
    await recordLoginEvent("mfa_success", { userId: user.id });
  });
  if (!res.ok) return res;
  redirect(next);
}

/** Starts TOTP enrolment: returns the QR code (SVG data URI) and the secret for manual entry. */
export async function startMfaEnrollment() {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user || user.mfaPending) throw new AppError("UNAUTHENTICATED");
    const db = await createClient();
    const { data: factors } = await db.auth.mfa.listFactors();
    // Abandoned enrolments would otherwise accumulate.
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await db.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authentificateur ${Date.now().toString(36)}`,
    });
    if (error || !data) throw new AppError("UNKNOWN", "La double authentification n'a pas pu être initialisée.");
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  });
}

/** Confirms enrolment with a first code; the factor becomes verified and the session aal2. */
export async function confirmMfaEnrollment(factorId: string, code: string) {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user || user.mfaPending) throw new AppError("UNAUTHENTICATED");
    const v = parseInput(z.object({ factorId: z.uuid(), code: codeSchema }), { factorId, code });
    await guardAttempts(user.id);
    const db = await createClient();
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: v.factorId, code: v.code });
    if (error) throw new AppError("VALIDATION", "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.");
    await recordLoginEvent("mfa_enabled", { userId: user.id });
    refresh();
  }, "Double authentification activée.");
}

/** Disabling requires a fresh valid code (proof of possession of the factor). */
export async function disableMfa(code: string) {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user || user.mfaPending) throw new AppError("UNAUTHENTICATED");
    const v = parseInput(z.object({ code: codeSchema }), { code });
    await guardAttempts(user.id);
    const db = await createClient();
    const factors = await verifiedTotp(db);
    if (!factors.length) return;
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factors[0].id, code: v.code });
    if (error) throw new AppError("VALIDATION", "Code incorrect.");
    for (const f of factors) {
      const { error: e } = await db.auth.mfa.unenroll({ factorId: f.id });
      if (e) throw new AppError("UNKNOWN");
    }
    await recordLoginEvent("mfa_disabled", { userId: user.id });
    refresh();
  }, "Double authentification désactivée.");
}
