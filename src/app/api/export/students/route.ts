import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { isoDate } from "@/lib/utils";
import { getAppContext } from "@/server/auth/session";
import { csvResponse, errorResponse } from "@/server/http";
import { exportStudents } from "@/server/services/students";

/** Export applies the same permissions as the interface (students.export + RLS). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const rows = await exportStudents(ctx);
    await ctx.db.rpc("log_export", { p_school: ctx.school.id, p_kind: "students", p_rows: rows.length });
    const csv = toCsv(rows, [
      { header: "matricule", value: (r) => r.matricule },
      { header: "nom", value: (r) => r.last_name },
      { header: "prenom", value: (r) => r.first_name },
      { header: "sexe", value: (r) => r.gender },
      { header: "date_naissance", value: (r) => r.birth_date },
      { header: "lieu_naissance", value: (r) => r.birth_place },
      { header: "classe", value: (r) => r.className },
      { header: "statut", value: (r) => r.status },
    ]);
    return csvResponse(csv, `eleves-${isoDate()}.csv`);
  } catch (e) {
    return errorResponse(e);
  }
}
