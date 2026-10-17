"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { parseInput, runAction } from "@/server/actions";
import { requireContext } from "@/server/auth/session";
import { ask, askSchema, deleteConversation } from "@/server/services/assistant";
import { announcementSchema, saveAnnouncement } from "@/server/services/communication";

export async function askAssistantAction(conversationId: string | null, message: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    return ask(ctx, parseInput(askSchema, { conversationId, message }));
  });
}

/**
 * Explicit user confirmation of a draft proposed by the assistant. It goes
 * through the normal announcement service (permission checks, RLS, audit) and
 * is saved as a DRAFT only: publishing remains a separate, deliberate action.
 */
export async function saveAssistantDraftAction(input: { title: string; body: string; priority: string }) {
  return runAction(async () => {
    const ctx = await requireContext();
    const draft = parseInput(announcementSchema, { title: input.title, body: input.body, priority: input.priority });
    return { id: await saveAnnouncement(ctx, { ...draft, publish: false }) };
  }, "Brouillon d'annonce enregistré. Relisez-le puis publiez-le depuis la page Annonces.");
}

export async function deleteConversationAction(id: string) {
  return runAction(async () => {
    const ctx = await requireContext();
    await deleteConversation(ctx, parseInput(z.object({ id: z.uuid() }), { id }).id);
    refresh();
  }, "Conversation supprimée.");
}
