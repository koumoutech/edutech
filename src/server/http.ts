import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";

export function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    const status =
      e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : e.code === "UNAUTHENTICATED" ? 401 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
  console.error("[api] unexpected error", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });
}
