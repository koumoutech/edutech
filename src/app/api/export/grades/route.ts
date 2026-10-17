import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { can } from "@/lib/authz";
import { toCsv } from "@/lib/csv";
import { isoDate } from "@/lib/utils";
import { getAppContext } from "@/server/auth/session";
import { csvResponse, errorResponse } from "@/server/http";

/** Grades of a term — only rows the user can read (RLS) and only with grades.export. */
export async function GET(req: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(ctx, "grades.export")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const term = req.nextUrl.searchParams.get("term");
  if (!z.uuid().safeParse(term).success) return NextResponse.json({ error: "term required" }, { status: 400 });
  try {
    const { data, error } = await ctx.db
      .from("grades")
      .select(
        "score, is_absent, student:students!grades_school_id_student_id_fkey(matricule, first_name, last_name), assessment:assessments!grades_school_id_assessment_id_fkey!inner(title, held_on, max_score, coefficient, status, term_id, cs:class_subjects!assessments_school_id_class_subject_id_fkey(class:classes!class_subjects_school_id_class_id_fkey(name), subject:subjects!class_subjects_school_id_subject_id_fkey(name)))",
      )
      .eq("school_id", ctx.school.id)
      .eq("assessment.term_id", term!)
      .limit(50000);
    if (error) throw error;
    const rows = data ?? [];
    await ctx.db.rpc("log_export", { p_school: ctx.school.id, p_kind: "grades", p_rows: rows.length });
    return csvResponse(
      toCsv(rows, [
        { header: "classe", value: (r) => r.assessment?.cs?.class?.name },
        { header: "matiere", value: (r) => r.assessment?.cs?.subject?.name },
        { header: "evaluation", value: (r) => r.assessment?.title },
        { header: "date", value: (r) => r.assessment?.held_on },
        { header: "statut", value: (r) => r.assessment?.status },
        { header: "matricule", value: (r) => r.student?.matricule },
        { header: "nom", value: (r) => r.student?.last_name },
        { header: "prenom", value: (r) => r.student?.first_name },
        { header: "note", value: (r) => (r.is_absent ? "ABS" : r.score === null ? "" : Number(r.score)) },
        { header: "bareme", value: (r) => Number(r.assessment?.max_score) },
        { header: "coefficient", value: (r) => Number(r.assessment?.coefficient) },
      ]),
      `notes-${isoDate()}.csv`,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
