import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/server/auth/security";
import { createClient } from "@/server/supabase/server";

/**
 * Landing point of e-mail links (invitation, password recovery, e-mail confirmation).
 * Exchanges the one-time code for a session, then redirects to a safe in-app path.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const db = await createClient();

  let ok = false;
  if (code) {
    ok = !(await db.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await db.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  const target = new URL(ok ? next : "/login?error=link", url.origin);
  return NextResponse.redirect(target);
}
