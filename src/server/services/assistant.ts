import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runAssistant, type ChatTurn } from "@/server/ai/assistant";
import { aiClient } from "@/server/ai/client";
import { resolveStudentRefs } from "@/server/ai/references";
import type { AssistantProposal } from "@/server/ai/tools";
import { assertCan, type AppContext } from "@/server/auth/session";
import { consumeRateLimit } from "@/server/auth/security";
import { isAiConfigured, serverEnv } from "@/server/env";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";

export const askSchema = z.object({
  conversationId: z.uuid().nullable(),
  message: z.string().trim().min(2, "Votre question est trop courte.").max(2000, "2000 caractères maximum."),
});

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed: string[];
  createdAt: string;
}

export interface AskResult {
  conversationId: string;
  messages: ChatMessageView[];
  students: Record<string, string | null>;
  proposals: AssistantProposal[];
}

export function assistantStatus() {
  const env = serverEnv();
  return { configured: isAiConfigured(), allowPersonalData: env.AI_ALLOW_PERSONAL_DATA, model: env.AI_MODEL };
}

export async function listConversations(ctx: AppContext) {
  assertCan(ctx, "ai.use");
  return unwrapList(
    await ctx.db
      .from("ai_conversations")
      .select("id, title, updated_at")
      .eq("school_id", ctx.school.id)
      .eq("user_id", ctx.user.id)
      .order("updated_at", { ascending: false })
      .limit(30),
  );
}

export async function loadConversation(ctx: AppContext, id: string) {
  assertCan(ctx, "ai.use");
  const { data: conv } = await ctx.db.from("ai_conversations").select("id, title").eq("id", id).eq("school_id", ctx.school.id).maybeSingle();
  if (!conv) return null;
  const rows = unwrapList(
    await ctx.db.from("ai_messages").select("id, role, content, tools_used, created_at").eq("conversation_id", id).order("created_at").limit(200),
  );
  const messages: ChatMessageView[] = rows.map((r) => ({ id: r.id, role: r.role as ChatMessageView["role"], content: r.content, toolsUsed: r.tools_used, createdAt: r.created_at }));
  const students = await resolveStudentRefs(ctx.db, ctx.school.id, messages.map((m) => m.content));
  return { id: conv.id, title: conv.title, messages, students };
}

export async function deleteConversation(ctx: AppContext, id: string) {
  assertCan(ctx, "ai.use");
  const { error } = await ctx.db.from("ai_conversations").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) throw fromDbError(error);
}

/**
 * One question/answer exchange. Authorization: `ai.use` here, then each tool
 * re-checks its own permission and reads through RLS.
 */
export async function ask(ctx: AppContext, input: z.infer<typeof askSchema>): Promise<AskResult> {
  assertCan(ctx, "ai.use");
  if (!isAiConfigured()) throw new AppError("AI_DISABLED");
  const env = serverEnv();

  // Abuse/cost protection: per user and per school.
  const okUser = await consumeRateLimit(`ai:user:${ctx.user.id}`, 20, 600);
  const okSchool = okUser && (await consumeRateLimit(`ai:school:${ctx.school.id}`, 400, 3600));
  if (!okUser || !okSchool) throw new AppError("RATE_LIMITED", "Vous avez atteint la limite de questions à l'assistant. Réessayez plus tard.");

  let conversationId = input.conversationId;
  let history: ChatTurn[] = [];
  if (conversationId) {
    const { data: conv } = await ctx.db.from("ai_conversations").select("id").eq("id", conversationId).eq("school_id", ctx.school.id).maybeSingle();
    if (!conv) throw new AppError("NOT_FOUND");
    const rows = unwrapList(
      await ctx.db.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12),
    );
    history = rows.reverse().map((r) => ({ role: r.role as ChatTurn["role"], content: r.content }));
  } else {
    const title = input.message.length > 70 ? `${input.message.slice(0, 67)}…` : input.message;
    conversationId = unwrap(await ctx.db.from("ai_conversations").insert({ school_id: ctx.school.id, title }).select("id").single()).id;
  }

  const userRow = unwrap(
    await ctx.db
      .from("ai_messages")
      .insert({ conversation_id: conversationId, school_id: ctx.school.id, role: "user", content: input.message })
      .select("id, created_at")
      .single(),
  );

  let reply;
  try {
    reply = await runAssistant(ctx, history, input.message, {
      client: aiClient(),
      model: env.AI_MODEL,
      maxToolRounds: env.AI_MAX_TOOL_ROUNDS,
      allowPersonalData: env.AI_ALLOW_PERSONAL_DATA,
      onToolCall: async (entry) => {
        // Audit without arguments or results.
        await ctx.db.from("ai_tool_invocations").insert({
          school_id: ctx.school.id,
          conversation_id: conversationId,
          tool_name: entry.tool,
          outcome: entry.outcome,
          result_count: entry.count,
          duration_ms: entry.durationMs,
        });
      },
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof Anthropic.APIError) {
      // Status only: never log prompts, responses or keys.
      console.error("[ai] provider error", e.status ?? "network");
      throw new AppError(e.status === 429 ? "RATE_LIMITED" : "AI_UNAVAILABLE");
    }
    throw e;
  }

  const assistantRow = unwrap(
    await ctx.db
      .from("ai_messages")
      .insert({ conversation_id: conversationId, school_id: ctx.school.id, role: "assistant", content: reply.text.slice(0, 20000), tools_used: reply.toolsUsed })
      .select("id, created_at")
      .single(),
  );
  await ctx.db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  const messages: ChatMessageView[] = [
    { id: userRow.id, role: "user", content: input.message, toolsUsed: [], createdAt: userRow.created_at },
    { id: assistantRow.id, role: "assistant", content: reply.text, toolsUsed: reply.toolsUsed, createdAt: assistantRow.created_at },
  ];
  return { conversationId, messages, students: await resolveStudentRefs(ctx.db, ctx.school.id, [reply.text]), proposals: reply.proposals };
}
