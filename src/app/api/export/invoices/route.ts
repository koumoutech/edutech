import { NextResponse } from "next/server";
import { canSchoolWide } from "@/lib/authz";
import { toCsv } from "@/lib/csv";
import { isoDate } from "@/lib/utils";
import { getAppContext } from "@/server/auth/session";
import { csvResponse, errorResponse } from "@/server/http";

/** Invoices export (finance.export + school-wide finance.read). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canSchoolWide(ctx, "finance.export") || !canSchoolWide(ctx, "finance.read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const { data, error } = await ctx.db
      .from("invoices")
      .select("number, issue_date, due_date, total, amount_paid, balance, status, currency, student:students!invoices_school_id_student_id_fkey(matricule, first_name, last_name)")
      .eq("school_id", ctx.school.id)
      .order("issue_date")
      .limit(20000);
    if (error) throw error;
    const rows = data ?? [];
    await ctx.db.rpc("log_export", { p_school: ctx.school.id, p_kind: "invoices", p_rows: rows.length });
    const csv = toCsv(rows, [
      { header: "numero", value: (r) => r.number },
      { header: "date_emission", value: (r) => r.issue_date },
      { header: "echeance", value: (r) => r.due_date },
      { header: "matricule", value: (r) => r.student?.matricule },
      { header: "eleve", value: (r) => `${r.student?.last_name ?? ""} ${r.student?.first_name ?? ""}` },
      { header: "total", value: (r) => Number(r.total) },
      { header: "paye", value: (r) => Number(r.amount_paid) },
      { header: "reste_du", value: (r) => Number(r.balance) },
      { header: "statut", value: (r) => r.status },
      { header: "devise", value: (r) => r.currency },
    ]);
    return csvResponse(csv, `factures-${isoDate()}.csv`);
  } catch (e) {
    return errorResponse(e);
  }
}
