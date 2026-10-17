import type { Db } from "@/server/supabase/server";

const REF_RE = /\[\[eleve:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;

export function extractStudentRefs(texts: string[]): string[] {
  const ids = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(REF_RE)) ids.add(m[1].toLowerCase());
  return [...ids];
}

/**
 * Resolves opaque student references to display names using the CURRENT user's
 * client: RLS decides which names may be shown. Unknown or forbidden ids map to
 * null and are rendered as a neutral placeholder.
 */
export async function resolveStudentRefs(db: Db, schoolId: string, texts: string[]): Promise<Record<string, string | null>> {
  const ids = extractStudentRefs(texts).slice(0, 200);
  const out: Record<string, string | null> = Object.fromEntries(ids.map((id) => [id, null]));
  if (!ids.length) return out;
  const { data } = await db.from("students").select("id, first_name, last_name").eq("school_id", schoolId).in("id", ids);
  for (const s of data ?? []) out[s.id] = `${s.first_name} ${s.last_name}`.trim();
  return out;
}
