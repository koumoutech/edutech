import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type Db = SupabaseClient<Database>;

/**
 * Supabase client acting AS THE SIGNED-IN USER: every query is subject to RLS.
 * This is the default client for all business code.
 */
export const createClient = cache(async (): Promise<Db> => {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session cookies instead.
        }
      },
    },
  });
});
