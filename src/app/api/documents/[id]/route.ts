import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/server/auth/session";
import { signedDocumentUrl } from "@/server/services/documents";

/** Redirects to a 60-second signed URL once RLS has confirmed the user may read the document. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const url = await signedDocumentUrl(ctx, id);
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
