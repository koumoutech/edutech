"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PERMISSIONS } from "@/lib/authz";
import { parseInput, runAction } from "@/server/actions";
import { getSessionUser, requireContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import {
  acceptInvitation,
  assignRole,
  createRole,
  gradingPolicySchema,
  inviteSchema,
  inviteUser,
  removeRole,
  revokeInvitation,
  roleSchema,
  schoolSchema,
  setGrant,
  setMemberStatus,
  updateGradingPolicy,
  updateSchool,
  uploadLogo,
} from "@/server/services/admin";
import { createClient } from "@/server/supabase/server";

export async function updateSchoolAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await updateSchool(ctx, parseInput(schoolSchema, fd));
    const logo = fd.get("logo");
    if (logo instanceof File && logo.size > 0) await uploadLogo(ctx, logo);
    refresh();
  }, "Paramètres de l'établissement enregistrés.");
}

export async function updateGradingPolicyAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await updateGradingPolicy(ctx, parseInput(gradingPolicySchema, fd));
    refresh();
  }, "Barème enregistré.");
}

export async function inviteUserAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const res = await inviteUser(ctx, parseInput(inviteSchema, fd));
    refresh();
    return res;
  }, "Invitation créée.");
}

export async function revokeInvitationAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await revokeInvitation(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Invitation révoquée.");
}

export async function assignRoleAction(userId: string, _r: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ userId: z.uuid(), roleId: z.uuid() }), { userId, roleId: fd.get("role_id") });
    await assignRole(ctx, v.userId, v.roleId);
    refresh();
  }, "Rôle attribué.");
}

export async function removeRoleAction(userId: string, roleId: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ userId: z.uuid(), roleId: z.uuid() }), { userId, roleId });
    await removeRole(ctx, v.userId, v.roleId);
    refresh();
  }, "Rôle retiré.");
}

export async function setMemberStatusAction(userId: string, status: string, reason: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ userId: z.uuid(), status: z.enum(["active", "suspended"]), reason: z.string().max(300).optional() }), {
      userId,
      status,
      reason: reason || undefined,
    });
    await setMemberStatus(ctx, v.userId, v.status, v.reason);
    refresh();
  }, status === "suspended" ? "Compte suspendu : ses sessions ont été fermées." : "Compte réactivé.");
}

export async function createRoleAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await createRole(ctx, parseInput(roleSchema, fd));
    refresh();
  }, "Rôle créé.");
}

export async function setGrantAction(roleId: string, permission: string, scope: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(
      z.object({ roleId: z.uuid(), permission: z.enum(PERMISSIONS), scope: z.enum(["school", "assigned", "linked", "self", "none"]) }),
      { roleId, permission, scope },
    );
    await setGrant(ctx, v.roleId, v.permission, v.scope === "none" ? null : v.scope);
  });
}

/** Accepts an invitation for the signed-in user. */
export async function acceptInvitationAction(token: string, isNew: boolean) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invitation/${token}`)}`);
  const res = await runAction(async () => {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new AppError("INVITATION_INVALID");
    await acceptInvitation({ db: await createClient() }, token);
  });
  if (!res.ok) return res;
  redirect(isNew ? "/auth/set-password?next=/app" : "/app");
}
