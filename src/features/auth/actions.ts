"use server";

import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { forgotPasswordSchema, loginSchema, setPasswordSchema, setupSchema } from "@/schemas/auth";
import { parseInput, runAction } from "@/server/actions";
import {
  clientIp,
  consumeRateLimit,
  fingerprint,
  recordLoginEvent,
  resetRateLimit,
  safeEqual,
  safeNextPath,
} from "@/server/auth/security";
import { getSessionUser } from "@/server/auth/session";
import { serverEnv } from "@/server/env";
import { AppError, type ActionResult } from "@/server/errors";
import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";

const GENERIC_LOGIN_ERROR = "Adresse e-mail ou mot de passe incorrect.";

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let next = "/app";
  const result = await runAction(async () => {
    const input = parseInput(loginSchema, formData);
    next = safeNextPath(input.next);
    const ip = await clientIp();
    const emailKey = `login:email:${fingerprint(input.email)}`;
    // 5 attempts / 15 min per account (then 15 min lock), 30 / 15 min per IP.
    const [emailOk, ipOk] = await Promise.all([
      consumeRateLimit(emailKey, 5, 900, 900),
      consumeRateLimit(`login:ip:${fingerprint(ip)}`, 30, 900, 900),
    ]);
    if (!emailOk || !ipOk) {
      await recordLoginEvent("locked_out", { email: input.email });
      throw new AppError("RATE_LIMITED");
    }

    const db = await createClient();
    const { data, error } = await db.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.user) {
      await recordLoginEvent("login_failure", { email: input.email });
      throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
    }
    const { data: profile } = await db.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
    if (profile && !profile.is_active) {
      await db.auth.signOut();
      await recordLoginEvent("login_failure", { userId: data.user.id, email: input.email });
      throw new AppError("FORBIDDEN", "Ce compte est désactivé. Contactez votre établissement.");
    }
    await resetRateLimit(emailKey);
    await recordLoginEvent("login_success", { userId: data.user.id, email: input.email });
    // Second factor enrolled: the session stays aal1 (no data access) until the code is verified.
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") next = `/auth/mfa?next=${encodeURIComponent(next)}`;
  });
  if (!result.ok) return result;
  redirect(next);
}

export async function signOut(): Promise<void> {
  const user = await getSessionUser();
  const db = await createClient();
  await db.auth.signOut();
  if (user) await recordLoginEvent("logout", { userId: user.id });
  redirect("/login");
}

/** Revokes every session of the current user (all devices). */
export async function signOutEverywhere(): Promise<void> {
  const user = await getSessionUser();
  const db = await createClient();
  await db.auth.signOut({ scope: "global" });
  if (user) await recordLoginEvent("session_revoked", { userId: user.id });
  redirect("/login?revoked=1");
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = parseInput(forgotPasswordSchema, formData);
    const ip = await clientIp();
    const allowed =
      (await consumeRateLimit(`reset:email:${fingerprint(email)}`, 3, 3600)) &&
      (await consumeRateLimit(`reset:ip:${fingerprint(ip)}`, 10, 3600));
    if (!allowed) throw new AppError("RATE_LIMITED");
    const db = await createClient();
    await db.auth.resetPasswordForEmail(email, {
      redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/set-password`,
    });
    await recordLoginEvent("password_reset_requested", { email });
    // Same answer whether or not the account exists (no account enumeration).
  }, "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
}

export async function setPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let next = "/app";
  const result = await runAction(async () => {
    const input = parseInput(setPasswordSchema, formData);
    next = safeNextPath(input.next);
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Le lien a expiré. Recommencez la procédure.");
    if (user.mfaPending) {
      throw new AppError("FORBIDDEN", "Validez d'abord votre code de double authentification.");
    }
    const db = await createClient();
    const { error } = await db.auth.updateUser({ password: input.password });
    if (error) {
      throw new AppError(
        "VALIDATION",
        error.code === "same_password"
          ? "Choisissez un mot de passe différent de l'ancien."
          : "Mot de passe refusé. Choisissez-en un plus robuste.",
      );
    }
    await recordLoginEvent("password_changed", { userId: user.id });
  });
  if (!result.ok) return result;
  redirect(next);
}

/**
 * Creates the very first platform super-administrator.
 * Requires SETUP_TOKEN (server secret) and only works while no platform admin exists.
 */
export async function bootstrapPlatform(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    const input = parseInput(setupSchema, formData);
    const expected = serverEnv().SETUP_TOKEN;
    const ip = await clientIp();
    if (!(await consumeRateLimit(`setup:ip:${fingerprint(ip)}`, 5, 3600, 3600))) throw new AppError("RATE_LIMITED");
    if (!expected || !safeEqual(input.token, expected))
      throw new AppError("FORBIDDEN", "Jeton d'initialisation invalide.");

    const admin = createAdminClient();
    const { count } = await admin.from("platform_admins").select("user_id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new AppError("ALREADY_INITIALIZED");

    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (error || !data.user)
      throw new AppError("VALIDATION", "Impossible de créer le compte (adresse déjà utilisée ?).");
    const { error: rpcError } = await admin.rpc("bootstrap_platform_admin", { p_user: data.user.id });
    if (rpcError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new AppError("ALREADY_INITIALIZED");
    }
  });
  if (!result.ok) return result;
  redirect("/login?setup=1");
}
