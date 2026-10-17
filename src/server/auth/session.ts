import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { can, type AuthzSubject, type Permission, type SchoolMembership, type Scope } from "@/lib/authz";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient, type Db } from "@/server/supabase/server";
import { AppError } from "@/server/errors";

export const ACTIVE_SCHOOL_COOKIE = "edudigi_school";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  avatarPath: string | null;
  theme: "system" | "light" | "dark";
}

export interface AppContext extends AuthzSubject {
  user: SessionUser;
  school: SchoolMembership;
  schools: SchoolMembership[];
  isPlatformAdmin: boolean;
  db: Db;
}

/** Returns the authenticated user (validated against Supabase Auth), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("full_name, avatar_path, theme, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile && !profile.is_active) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile?.full_name || data.user.email || "",
    avatarPath: profile?.avatar_path ?? null,
    theme: (profile?.theme as SessionUser["theme"]) ?? "system",
  };
});

interface RawContext {
  user_id: string | null;
  is_platform_admin: boolean;
  schools: SchoolMembership[];
}

/** Loads memberships, roles and permissions of the current user (one RPC). */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const db = await createClient();
  const { data, error } = await db.rpc("my_context");
  if (error || !data) return null;
  const raw = data as unknown as RawContext;
  const schools = (raw.schools ?? []).map((s) => ({ ...s, roles: s.roles ?? [], permissions: s.permissions ?? {} }));
  if (schools.length === 0) {
    return null;
  }
  const preferred = (await cookies()).get(ACTIVE_SCHOOL_COOKIE)?.value;
  const school = schools.find((s) => s.id === preferred) ?? schools[0];
  return {
    user,
    school,
    schools,
    isPlatformAdmin: raw.is_platform_admin,
    permissions: school.permissions,
    db,
  };
});

/** For pages and actions under /app: redirects when the user is not signed in or has no school. */
export async function requireContext(): Promise<AppContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getAppContext();
  if (!ctx) redirect("/no-access");
  return ctx;
}

/** Throws FORBIDDEN unless the user holds the permission (optionally under given scopes). */
export function assertCan(ctx: AppContext, permission: Permission, scopes?: Scope[]): void {
  if (!can(ctx, permission, scopes)) throw new AppError("FORBIDDEN");
}

/** Page-level guard: renders the 403 page when the permission is missing. */
export async function requirePermission(permission: Permission, scopes?: Scope[]): Promise<AppContext> {
  const ctx = await requireContext();
  if (!can(ctx, permission, scopes)) redirect("/app/forbidden");
  return ctx;
}
