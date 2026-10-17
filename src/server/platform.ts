import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export interface PlatformBranding {
  productName: string;
  tagline: string;
  supportEmail: string;
}

export const PLATFORM_SETTINGS_TAG = "platform-settings";

/**
 * Public branding (product name is configurable by the platform super-administrator).
 * Only rows flagged `is_public` are readable anonymously; cached and invalidated by tag.
 */
export async function getBranding(): Promise<PlatformBranding> {
  "use cache";
  cacheTag(PLATFORM_SETTINGS_TAG);
  cacheLife("hours");

  const fallback: PlatformBranding = {
    productName: publicEnv.NEXT_PUBLIC_APP_NAME,
    tagline: "La plateforme intelligente de gestion scolaire",
    supportEmail: "support@example.com",
  };
  if (!isSupabaseConfigured()) return fallback;
  try {
    const anon = createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data } = await anon.from("platform_settings").select("key, value").eq("is_public", true);
    const map = new Map((data ?? []).map((r) => [r.key, r.value]));
    return {
      productName:
        typeof map.get("product.name") === "string" ? (map.get("product.name") as string) : fallback.productName,
      tagline:
        typeof map.get("product.tagline") === "string" ? (map.get("product.tagline") as string) : fallback.tagline,
      supportEmail:
        typeof map.get("product.support_email") === "string"
          ? (map.get("product.support_email") as string)
          : fallback.supportEmail,
    };
  } catch {
    return fallback;
  }
}
