import { NextResponse } from "next/server";
import { canSchoolWide } from "@/lib/authz";
import { toCsv } from "@/lib/csv";
import { isoDate } from "@/lib/utils";
import { getAppContext } from "@/server/auth/session";
import { csvResponse, errorResponse } from "@/server/http";

/** Attendance records of the last 30 days (attendance.export + school-wide read). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canSchoolWide(ctx, "attendance.read") || !canSchoolWide(ctx, "attendance.export")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const { data, error } = await ctx.db
      .from("attendance_records")
      .select(
        "status, minutes_late, student:students!attendance_records_school_id_student_id_fkey(matricule, first_name, last_name), session:attendance_sessions!attendance_records_school_id_session_id_fkey!inner(date, class:classes!attendance_sessions_school_id_class_id_fkey(name))",
      )
      .eq("school_id", ctx.school.id)
      .gte("session.date", isoDate(from))
      .limit(20000);
    if (error) throw error;
    const rows = data ?? [];
    await ctx.db.rpc("log_export", { p_school: ctx.school.id, p_kind: "attendance", p_rows: rows.length });
    const csv = toCsv(rows, [
      { header: "date", value: (r) => r.session?.date },
      { header: "classe", value: (r) => r.session?.class?.name },
      { header: "matricule", value: (r) => r.student?.matricule },
      { header: "nom", value: (r) => r.student?.last_name },
      { header: "prenom", value: (r) => r.student?.first_name },
      { header: "statut", value: (r) => r.status },
      { header: "minutes_retard", value: (r) => r.minutes_late },
    ]);
    return csvResponse(csv, `presences-${isoDate()}.csv`);
  } catch (e) {
    return errorResponse(e);
  }
}
