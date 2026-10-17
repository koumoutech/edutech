"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Browser client, used only for Realtime subscriptions (notifications, messages). */
export function getBrowserClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
