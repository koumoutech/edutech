/**
 * Sets RANDOM passwords on the fictitious demo accounts and prints them once.
 *
 * Safety rails:
 *  - refuses to run when APP_ENV=production;
 *  - only touches the 12 seeded demo user ids, and only if they belong to a school
 *    flagged is_demo = true (seed.sql refuses to run next to real schools);
 *  - passwords are generated per run, never stored in the repository, and can be
 *    rotated at any time by running the script again.
 *
 * Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm demo:credentials
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEMO_SCHOOL = "00000000-0000-4000-a000-000000000001";
const DEMO_USERS = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-b000-${String(i + 1).padStart(12, "0")}`);

async function main() {
  if ((process.env.APP_ENV ?? "development") === "production") {
    throw new Error("Refusing to create demo credentials when APP_ENV=production.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: school, error } = await admin
    .from("schools")
    .select("id, name, is_demo")
    .eq("id", DEMO_SCHOOL)
    .maybeSingle();
  if (error) throw new Error(`Cannot read schools: ${error.message}`);
  if (!school?.is_demo)
    throw new Error(
      "Demo school not found or not flagged as demo. Run supabase/seed.sql on a non-production database first.",
    );

  const { count } = await admin.from("schools").select("id", { count: "exact", head: true }).eq("is_demo", false);
  if ((count ?? 0) > 0)
    throw new Error("Real (non-demo) schools exist in this database: demo credentials are not allowed here.");

  console.log(`Demo credentials for « ${school.name} » (fictitious data). Rotate by re-running this script.\n`);
  for (const id of DEMO_USERS) {
    const { data: membership } = await admin
      .from("memberships")
      .select("user_id")
      .eq("user_id", id)
      .eq("school_id", DEMO_SCHOOL)
      .limit(1);
    if (!membership?.length) continue;
    const password = `${randomBytes(12).toString("base64url")}!9a`;
    const { data: user, error: upd } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (upd) {
      console.error(`  ${id}: ${upd.message}`);
      continue;
    }
    console.log(`  ${user.user.email?.padEnd(36)} ${password}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
