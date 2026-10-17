import { z } from "zod";

/**
 * Public configuration (safe for the browser). Values are inlined at build time.
 * Missing Supabase settings put the app in "configuration required" mode instead of crashing,
 * so the public pages and CI builds work without secrets.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).max(40).default("EduDigi"),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || undefined,
});

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
