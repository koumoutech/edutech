import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { reportCardPdf } from "@/server/pdf/documents";
import { getReportCard } from "@/server/services/assessments";
import { pdfResponse, schoolHeader } from "@/server/services/school";

/** Report card PDF — same RLS rules as the screen (families only get published cards). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const [rc, school] = await Promise.all([getReportCard(ctx, id), schoolHeader(ctx)]);
    const bytes = await reportCardPdf(school, {
      ...rc,
      average: rc.average === null ? null : Number(rc.average),
      class_average: rc.class_average === null ? null : Number(rc.class_average),
      report_card_lines: rc.report_card_lines.map((l) => ({ ...l, coefficient: Number(l.coefficient) })),
    });
    return pdfResponse(bytes, `bulletin-${rc.student?.last_name ?? "eleve"}-${rc.term?.name ?? ""}.pdf`);
  } catch (e) {
    return errorResponse(e);
  }
}
