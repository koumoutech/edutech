import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/server/env";
import type { Database } from "@/types/database";

/**
 * PRIVILEGED client (service role, bypasses RLS).
 *
 * Allowed uses only — each one is documented in documentation/securite.md:
 *   1. auth administration (invitations, account suspension at the auth level),
 *   2. security telemetry (login events, rate limiting) before a session exists,
 *   3. first platform administrator bootstrap (guarded by SETUP_TOKEN),
 *   4. the outbound notification worker (guarded by CRON_SECRET).
 * Never use it to read or write business data on behalf of a user.
 */
export function createAdminClient() {
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !publicEnv.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
