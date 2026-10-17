import "server-only";
import type { AppContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import type { SchoolHeader } from "@/server/pdf/documents";

export async function schoolHeader(ctx: AppContext): Promise<SchoolHeader> {
  const { data } = await ctx.db
    .from("schools")
    .select("name, address, city, phone, email, currency")
    .eq("id", ctx.school.id)
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND");
  return data;
}

export function pdfResponse(bytes: Uint8Array, filename: string, inline = true): Response {
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
