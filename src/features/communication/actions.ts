"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import {
  announcementSchema,
  archiveAnnouncement,
  createRequest,
  publishAnnouncement,
  reply,
  requestSchema,
  saveAnnouncement,
  setPreference,
  startThread,
  updateRequest,
} from "@/server/services/communication";

export async function saveAnnouncementAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await saveAnnouncement(
      ctx,
      parseInput(announcementSchema, {
        id: fd.get("id") || undefined,
        title: fd.get("title"),
        body: fd.get("body"),
        priority: fd.get("priority"),
        audience_roles: fd.getAll("audience_roles"),
        audience_class_ids: fd.getAll("audience_class_ids"),
        is_pinned: fd.get("is_pinned") ?? undefined,
        expires_at: fd.get("expires_at") || undefined,
        publish: fd.get("publish") ?? undefined,
      }),
    );
    refresh();
  }, "Annonce enregistrée.");
}

export async function publishAnnouncementAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const n = await publishAnnouncement(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
    return { notified: n };
  }, "Annonce publiée et diffusée.");
}

export async function archiveAnnouncementAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await archiveAnnouncement(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Annonce archivée.");
}

export async function setPreferenceAction(type: string, channel: string, enabled: boolean) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ type: z.string().max(60), channel: z.enum(["in_app", "email", "sms"]), enabled: z.boolean() }), { type, channel, enabled });
    await setPreference(ctx, v.type, v.channel, v.enabled);
  });
}

export async function startThreadAction(_prev: unknown, fd: FormData) {
  let id = "";
  const res = await runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(
      z.object({ subject: z.string().trim().min(1).max(160), recipients: z.array(z.uuid()).min(1, "Choisissez au moins un destinataire").max(50), body: z.string().trim().min(1).max(5000) }),
      { subject: fd.get("subject"), recipients: fd.getAll("recipients"), body: fd.get("body") },
    );
    id = await startThread(ctx, v.subject, v.recipients, v.body);
  });
  if (!res.ok) return res;
  redirect(`/app/messages/${id}`);
}

export async function replyAction(threadId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(z.object({ threadId: z.uuid(), body: z.string().trim().min(1).max(5000) }), { threadId, body: fd.get("body") });
    await reply(ctx, v.threadId, v.body);
    refresh();
  });
}

export async function createRequestAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await requireContext();
    await createRequest(ctx, parseInput(requestSchema, fd));
    refresh();
  }, "Demande envoyée à l'établissement.");
}

export async function updateRequestAction(id: string, status: string, resolution: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    const v = parseInput(
      z.object({ id: z.uuid(), status: z.enum(["in_progress", "done", "rejected", "cancelled"]), resolution: z.string().max(2000).optional() }),
      { id, status, resolution: resolution || undefined },
    );
    await updateRequest(ctx, v.id, v.status, v.resolution);
    refresh();
  }, "Demande mise à jour.");
}
