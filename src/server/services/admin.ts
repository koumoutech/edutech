import "server-only";
import { z } from "zod";
import { PERMISSIONS, type Permission } from "@/lib/authz";
import { publicEnv } from "@/lib/env";
import { MAX_UPLOAD_BYTES, sniffMime } from "@/lib/files";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { randomToken, sha256Hex } from "@/server/auth/security";
import { serverEnv } from "@/server/env";
import { AppError, fromDbError, unwrapList } from "@/server/errors";
import { createAdminClient } from "@/server/supabase/admin";

export const schoolSchema = z.object({
  name: z.string().trim().min(2).max(160),
  short_name: z.string().trim().max(20).optional(),
  school_type: z.enum(["preschool", "primary", "secondary", "middle", "high", "mixed"]),
  sector: z.enum(["private", "public"]),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  country: z.string().trim().length(2).toUpperCase(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  website: z.url().optional().or(z.literal("").transform(() => undefined)),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  timezone: z.string().trim().min(3).max(60),
  brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("").transform(() => undefined)),
});

export const gradingPolicySchema = z.object({
  scale_max: z.coerce.number().positive().max(1000),
  passing_mark: z.coerce.number().min(0).max(1000),
  decimals: z.coerce.number().int().min(0).max(4),
  rounding: z.enum(["half_up", "down", "up"]),
  missing_policy: z.enum(["exclude", "zero"]),
  excused_policy: z.enum(["exclude", "zero"]),
  ranking_enabled: z.literal("on").optional().transform((v) => v === "on"),
  education_system: z.string().trim().max(60),
});

export const inviteSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  role_id: z.uuid(),
  link_kind: z.enum(["student", "guardian", "staff"]).optional().or(z.literal("").transform(() => undefined)),
  link_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
});

export async function getSchool(ctx: AppContext) {
  const { data } = await ctx.db.from("schools").select("*").eq("id", ctx.school.id).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export async function updateSchool(ctx: AppContext, input: z.infer<typeof schoolSchema>) {
  assertCan(ctx, "school.manage", ["school"]);
  const { error } = await ctx.db
    .from("schools")
    .update({
      ...input,
      short_name: input.short_name || null,
      address: input.address || null,
      city: input.city || null,
      phone: input.phone || null,
      email: input.email ?? null,
      website: input.website ?? null,
      brand_color: input.brand_color ?? null,
    })
    .eq("id", ctx.school.id);
  if (error) throw fromDbError(error);
}

export async function uploadLogo(ctx: AppContext, file: File) {
  assertCan(ctx, "school.manage", ["school"]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > Math.min(MAX_UPLOAD_BYTES, 2 * 1024 * 1024)) throw new AppError("VALIDATION", "Logo trop volumineux (2 Mo maximum).");
  const mime = sniffMime(bytes);
  if (!mime || mime === "application/pdf") throw new AppError("VALIDATION", "Format accepté : PNG, JPEG ou WEBP.");
  const path = `${ctx.school.id}/logo-${Date.now()}.${mime.split("/")[1]}`;
  const { error } = await ctx.db.storage.from("school-assets").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new AppError("UNKNOWN", "Le logo n'a pas pu être enregistré.");
  const { error: e2 } = await ctx.db.from("schools").update({ logo_path: path }).eq("id", ctx.school.id);
  if (e2) throw fromDbError(e2);
}

export async function getGradingPolicy(ctx: AppContext) {
  const { data } = await ctx.db.from("grading_policies").select("*").eq("school_id", ctx.school.id).eq("is_default", true).maybeSingle();
  return data;
}

export async function updateGradingPolicy(ctx: AppContext, input: z.infer<typeof gradingPolicySchema>) {
  assertCan(ctx, "academics.manage", ["school"]);
  if (input.passing_mark > input.scale_max) throw new AppError("VALIDATION", "Le seuil de réussite dépasse le barème.");
  const { error } = await ctx.db.from("grading_policies").update(input).eq("school_id", ctx.school.id).eq("is_default", true);
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// Users, roles, invitations
// ---------------------------------------------------------------------------

export async function listMembers(ctx: AppContext) {
  assertCan(ctx, "users.read");
  const [memberships, roles, invitations] = await Promise.all([
    ctx.db.from("memberships").select("id, user_id, status, role_id, created_at, suspended_reason").eq("school_id", ctx.school.id),
    ctx.db.from("roles").select("id, key, name, is_system, is_privileged, description").eq("school_id", ctx.school.id).order("name"),
    ctx.db.from("invitations").select("id, email, role_id, status, expires_at, created_at, link_kind").eq("school_id", ctx.school.id).eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  const ids = [...new Set((memberships.data ?? []).map((m) => m.user_id))];
  const { data: profiles } = ids.length ? await ctx.db.from("profiles").select("id, full_name, email, is_active").in("id", ids) : { data: [] };
  const byUser = new Map<string, { user_id: string; name: string; email: string; status: string; roles: { id: string; name: string }[] }>();
  const roleById = new Map((roles.data ?? []).map((r) => [r.id, r]));
  for (const m of memberships.data ?? []) {
    const p = profiles?.find((x) => x.id === m.user_id);
    const entry = byUser.get(m.user_id) ?? { user_id: m.user_id, name: p?.full_name || p?.email || "Utilisateur", email: p?.email ?? "", status: m.status, roles: [] };
    const role = roleById.get(m.role_id);
    if (role) entry.roles.push({ id: role.id, name: role.name });
    if (m.status !== "active") entry.status = m.status;
    byUser.set(m.user_id, entry);
  }
  return {
    members: [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name)),
    roles: roles.data ?? [],
    invitations: invitations.data ?? [],
  };
}

/** Creates an invitation (hashed token) and delivers it by e-mail. Returns the link for manual sharing. */
export async function inviteUser(ctx: AppContext, input: z.infer<typeof inviteSchema>) {
  assertCan(ctx, "users.create", ["school"]);
  if ((input.link_kind && !input.link_id) || (!input.link_kind && input.link_id)) throw new AppError("VALIDATION");
  const token = randomToken();
  const { error } = await ctx.db.rpc("create_invitation", {
    p_school: ctx.school.id,
    p_email: input.email,
    p_role: input.role_id,
    p_token_hash: sha256Hex(token),
    p_link_kind: input.link_kind,
    p_link_id: input.link_id,
  });
  if (error) throw fromDbError(error);
  const link = `${publicEnv.NEXT_PUBLIC_APP_URL}/invitation/${token}`;
  let delivered = false;
  if (serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    // New account: Supabase sends the invite e-mail; the callback lands on our invitation page.
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(`/invitation/${token}?new=1`)}`,
      data: { invited_to: ctx.school.id },
    });
    if (!inviteError) delivered = true;
    else {
      // Existing account: queue our own e-mail with the invitation link.
      const { error: qError } = await admin.from("outbound_messages").insert({
        school_id: ctx.school.id,
        channel: "email",
        recipient: input.email,
        subject: `Invitation — ${ctx.school.name}`,
        body: `Vous êtes invité(e) à rejoindre ${ctx.school.name}.\nConnectez-vous puis ouvrez ce lien (valable 7 jours) :\n${link}`,
      });
      delivered = !qError;
    }
  }
  return { link, delivered };
}

export async function revokeInvitation(ctx: AppContext, id: string) {
  const { error } = await ctx.db.rpc("revoke_invitation", { p_invitation: id });
  if (error) throw fromDbError(error);
}

export async function acceptInvitation(ctx: { db: AppContext["db"] }, token: string) {
  const { data, error } = await ctx.db.rpc("accept_invitation", { p_token: token });
  if (error) throw fromDbError(error);
  return data as string;
}

export async function assignRole(ctx: AppContext, userId: string, roleId: string) {
  const { error } = await ctx.db.rpc("assign_role", { p_school: ctx.school.id, p_user: userId, p_role: roleId });
  if (error) throw fromDbError(error);
}

export async function removeRole(ctx: AppContext, userId: string, roleId: string) {
  const { error } = await ctx.db.rpc("remove_role", { p_school: ctx.school.id, p_user: userId, p_role: roleId });
  if (error) throw fromDbError(error);
}

export async function setMemberStatus(ctx: AppContext, userId: string, status: "active" | "suspended", reason?: string) {
  const { error } = await ctx.db.rpc("set_member_status", { p_school: ctx.school.id, p_user: userId, p_status: status, p_reason: reason });
  if (error) throw fromDbError(error);
  // Revoke live sessions of a suspended account (documented privileged use).
  if (status === "suspended" && serverEnv().SUPABASE_SERVICE_ROLE_KEY) {
    await createAdminClient().auth.admin.signOut(userId, "global").catch(() => undefined);
  }
}

export async function rolesMatrix(ctx: AppContext) {
  assertCan(ctx, "users.read");
  const [roles, perms, rp] = await Promise.all([
    ctx.db.from("roles").select("id, key, name, is_system, is_privileged").eq("school_id", ctx.school.id).order("name"),
    ctx.db.from("permissions").select("key, resource, action, label, sensitive").order("key"),
    ctx.db.from("role_permissions").select("role_id, permission_key, scope"),
  ]);
  return { roles: unwrapList(roles), permissions: unwrapList(perms), grants: unwrapList(rp) };
}

export const roleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().regex(/^[a-z0-9_]{2,48}$/, "Identifiant : minuscules, chiffres, _"),
  description: z.string().trim().max(300).optional(),
  copy_from: z.uuid().optional().or(z.literal("").transform(() => undefined)),
});

export async function createRole(ctx: AppContext, input: z.infer<typeof roleSchema>) {
  assertCan(ctx, "roles.manage", ["school"]);
  const { data, error } = await ctx.db
    .from("roles")
    .insert({ school_id: ctx.school.id, key: input.key, name: input.name, description: input.description ?? null, is_system: false })
    .select("id")
    .single();
  if (error) throw fromDbError(error);
  if (input.copy_from) {
    const { data: src } = await ctx.db.from("role_permissions").select("permission_key, scope").eq("role_id", input.copy_from);
    if (src?.length) {
      const { error: e2 } = await ctx.db.from("role_permissions").insert(src.map((p) => ({ ...p, role_id: data.id })));
      if (e2) throw fromDbError(e2);
    }
  }
  return data.id;
}

export async function setGrant(ctx: AppContext, roleId: string, permission: Permission, scope: "school" | "assigned" | "linked" | "self" | null) {
  assertCan(ctx, "roles.manage", ["school"]);
  if (!PERMISSIONS.includes(permission)) throw new AppError("VALIDATION");
  const { data: role } = await ctx.db.from("roles").select("key").eq("id", roleId).eq("school_id", ctx.school.id).maybeSingle();
  if (!role) throw new AppError("NOT_FOUND");
  if (role.key === "school_admin" && (permission === "roles.manage" || permission === "users.manage") && scope !== "school") {
    throw new AppError("FORBIDDEN", "Impossible de retirer l'administration des rôles à l'administrateur d'établissement (risque de blocage).");
  }
  const { error } =
    scope === null
      ? await ctx.db.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", permission)
      : await ctx.db.from("role_permissions").upsert({ role_id: roleId, permission_key: permission, scope }, { onConflict: "role_id,permission_key" });
  if (error) throw fromDbError(error);
}

export async function auditLog(ctx: AppContext, page: number, entity?: string) {
  assertCan(ctx, "audit.read", ["school"]);
  const from = (page - 1) * 50;
  let q = ctx.db
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, changes, reason, created_at, actor_id", { count: "exact" })
    .eq("school_id", ctx.school.id)
    .order("created_at", { ascending: false })
    .range(from, from + 49);
  if (entity) q = q.eq("entity_type", entity);
  const { data, error, count } = await q;
  if (error) throw fromDbError(error);
  const actors = [...new Set((data ?? []).map((d) => d.actor_id).filter(Boolean))] as string[];
  const { data: profiles } = actors.length ? await ctx.db.from("profiles").select("id, full_name, email").in("id", actors) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || ""]));
  return { rows: (data ?? []).map((d) => ({ ...d, actor: d.actor_id ? (names.get(d.actor_id) ?? "Utilisateur") : "Système" })), total: count ?? 0 };
}
