import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

/** Salted, non-reversible fingerprint for logs and rate-limit keys (no raw PII stored). */
export function fingerprint(value: string): string {
  const salt = serverEnv().SECURITY_HASH_SALT ?? "dev-only-salt-change-me";
  return createHmac("sha256", salt).update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** URL-safe random secret (invitations). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 300);
}

// In-memory fallback used only when the service role is not configured (local dev).
const memoryBuckets = new Map<string, { start: number; hits: number }>();

function hasServiceRole(): boolean {
  return Boolean(serverEnv().SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Fixed-window rate limiter backed by PostgreSQL (shared across instances).
 * Returns true when the request may proceed.
 */
export async function consumeRateLimit(key: string, max: number, windowSeconds: number, blockSeconds = 0): Promise<boolean> {
  if (!hasServiceRole()) {
    const now = Date.now();
    const bucket = memoryBuckets.get(key);
    if (!bucket || now - bucket.start > windowSeconds * 1000) {
      memoryBuckets.set(key, { start: now, hits: 1 });
      return true;
    }
    bucket.hits += 1;
    return bucket.hits <= max;
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds,
  });
  if (error) {
    // Fail closed for authentication endpoints.
    console.error("[rate-limit] database error", error.code);
    return false;
  }
  return data === true;
}

export async function resetRateLimit(key: string): Promise<void> {
  if (!hasServiceRole()) {
    memoryBuckets.delete(key);
    return;
  }
  await createAdminClient().rpc("reset_rate_limit", { p_key: key });
}

export type LoginEvent =
  | "login_success"
  | "login_failure"
  | "logout"
  | "password_reset_requested"
  | "password_changed"
  | "locked_out"
  | "session_revoked";

/** Records an important authentication event (hashed e-mail/IP, never the password). */
export async function recordLoginEvent(event: LoginEvent, opts: { userId?: string | null; email?: string }): Promise<void> {
  if (!hasServiceRole()) return;
  try {
    const ip = await clientIp();
    await createAdminClient()
      .from("login_events")
      .insert({
        event,
        user_id: opts.userId ?? null,
        email_hash: opts.email ? fingerprint(opts.email) : null,
        ip_hash: fingerprint(ip),
        user_agent: await userAgent(),
      });
  } catch (e) {
    console.error("[security] could not record login event", e instanceof Error ? e.message : e);
  }
}

/** Only allow in-app relative redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (!/^\/(app|invitation|auth\/set-password)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
