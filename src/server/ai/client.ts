import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/server/errors";
import { isAiConfigured, serverEnv } from "@/server/env";
import type { MessagesClient } from "./assistant";

let client: Anthropic | undefined;

/** Server-only Anthropic client. The API key never leaves the server. */
export function aiClient(): MessagesClient {
  if (!isAiConfigured()) throw new AppError("AI_DISABLED");
  client ??= new Anthropic({ apiKey: serverEnv().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  return { create: (params) => client!.messages.create(params) };
}
