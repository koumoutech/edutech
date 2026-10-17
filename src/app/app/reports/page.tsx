import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { AreaChartView, BarChartView } from "@/components/charts/lazy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, formatPercent, formatScore, fullName, isoDate } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { assessmentFrame } from "@/server/services/assessments";

export const metadata: Metadata = { title: "Rapports & analyses" };

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("reports.read");
  const sp = await searchParams;
  const frame = await assessmentFrame(ctx);
  const term = frame.terms.find((t) => t.id === sp.term) ?? frame.currentTerm;
  const days = [30, 90, 180].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  const s = ctx.school.id;
  const db = ctx.db;
  const finance = canSchoolWide(ctx, "finance.read");
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() - 5, 1);

  const [byLevel, performance, termAverages, attendance, absentees, financeSummary, cashflow, expenses, staffCount, leaves] = await Promise.all([
    frame.year ? db.rpc("stats_enrollment_by_level", { p_school: s, p_year: frame.year.id }) : null,
    term && can(ctx, "grades.read") ? db.rpc("stats_class_performance", { p_school: s, p_term: term.id }) : null,
    frame.year && can(ctx, "grades.read") ? db.rpc("stats_term_averages", { p_school: s, p_year: frame.year.id }) : null,
    can(ctx, "attendance.read") ? db.rpc("stats_attendance_daily", { p_school: s, p_from: isoDate(from), p_to: isoDate() }) : null,
    can(ctx, "attendance.read") ? db.rpc("stats_top_absentees", { p_school: s, p_from: isoDate(from), p_to: isoDate(), p_limit: 10 }) : null,
    finance ? db.rpc("stats_finance_summary", { p_school: s, p_year: frame.year?.id }) : null,
    finance ? db.rpc("stats_monthly_cashflow", { p_school: s, p_from: isoDate(sixMonths), p_to: isoDate() }) : null,
    finance && frame.year ? db.rpc("stats_expenses_by_category", { p_school: s, p_year: frame.year.id }) : null,
    canSchoolWide(ctx, "staff.read") ? db.from("staff_members").select("is_teacher, status").eq("school_id", s).neq("status", "archived") : null,
    canSchoolWide(ctx, "leaves.read") ? db.from("leave_requests").select("kind, status, starts_on, ends_on").eq("school_id", s).gte("starts_on", isoDate(from)) : null,
  ]);
  const cur = ctx.school.currency;
  const perf = performance?.data ?? [];
  const att = attendance?.data ?? [];
  const totals = att.reduce((a, r) => ({ p: a.p + Number(r.present) + Number(r.late), all: a.all + Number(r.present) + Number(r.late) + Number(r.absent) + Number(r.excused) }), { p: 0, all: 0 });
  const fin = financeSummary?.data?.[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports & analyses"
        description="Indicateurs calculés en temps réel à partir des données de l'établissement, dans la limite de vos autorisations."
        actions={
          <>
            {can(ctx, "students.export") && (
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/students" download>
                  <DownloadIcon /> Élèves
                </a>
              </Button>
            )}
            {can(ctx, "attendance.export") && (
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/attendance" download>
                  <DownloadIcon /> Présences
                </a>
              </Button>
            )}
            {can(ctx, "grades.export") && term && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/grades?term=${term.id}`} download>
                  <DownloadIcon /> Notes
                </a>
              </Button>
            )}
            {can(ctx, "finance.export") && (
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/invoices" download>
                  <DownloadIcon /> Factures
                </a>
              </Button>
            )}
          </>
        }
      />
      <Card className="p-3">
        <form className="flex flex-wrap gap-2">
          <Select name="term" defaultValue={term?.id} aria-label="Période" className="w-auto">
            {frame.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select name="days" defaultValue={String(days)} aria-label="Fenêtre d'analyse des absences" className="w-auto">
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
            <option value="180">180 derniers jours</option>
          </Select>
          <Button type="submit" variant="secondary">
            Actualiser
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Effectifs par niveau</CardTitle>
            <CardDescription>
              {(byLevel?.data ?? []).reduce((a, l) => a + Number(l.students), 0)} élèves · capacité {(byLevel?.data ?? []).reduce((a, l) => a + Number(l.capacity), 0)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarChartView
              label="Effectifs par niveau"
              data={(byLevel?.data ?? []).map((l) => ({ niveau: l.level_name, filles: Number(l.girls), garcons: Number(l.boys) }))}
              xKey="niveau"
              stacked
              series={[
                { key: "filles", label: "Filles", slot: 1 },
                { key: "garcons", label: "Garçons", slot: 3 },
              ]}
              valueFormat="integer"
            />
          </CardContent>
        </Card>

        {can(ctx, "grades.read") && (
          <Card>
            <CardHeader>
              <CardTitle>Résultats et réussite — {term?.name}</CardTitle>
              <CardDescription>Moyenne par classe et taux de réussite (évaluations validées)</CardDescription>
            </CardHeader>
            <CardContent>
              {perf.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Classe</TH>
                      <TH className="text-right">Moyenne</TH>
                      <TH className="text-right">Élèves</TH>
                      <TH className="text-right">Réussite</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {perf.map((c) => (
                      <TR key={c.class_id}>
                        <TD className="font-medium">{c.class_name}</TD>
                        <TD className="text-right tabular-nums">{formatScore(Number(c.average))}</TD>
                        <TD className="text-right tabular-nums">{c.students}</TD>
                        <TD className="text-right tabular-nums">{formatPercent(Number(c.students) ? 1 - Number(c.below_passing) / Number(c.students) : null)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun résultat validé pour cette période.</p>
              )}
            </CardContent>
          </Card>
        )}

        {can(ctx, "grades.read") && (termAverages?.data ?? []).length >= 2 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Comparaison entre périodes</CardTitle>
            </CardHeader>
            <CardContent>
              <AreaChartView
                label="Moyenne générale par période"
                data={(termAverages?.data ?? []).map((t) => ({ periode: t.term_name, moyenne: Number(t.average) }))}
                xKey="periode"
                series={[{ key: "moyenne", label: "Moyenne /20", slot: 1 }]}
                yDomain={[0, 20]}
              />
            </CardContent>
          </Card>
        )}

        {can(ctx, "attendance.read") && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Absences ({days} jours)</CardTitle>
                <CardDescription>Taux de présence : {totals.all ? formatPercent(totals.p / totals.all, 1) : "—"}</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChartView
                  label="Absences par jour"
                  data={att.map((r) => ({ jour: formatDate(r.day, { day: "2-digit", month: "2-digit", year: undefined }), absences: Number(r.absent), retards: Number(r.late), justifiees: Number(r.excused) }))}
                  xKey="jour"
                  stacked
                  series={[
                    { key: "absences", label: "Non justifiées", slot: 2 },
                    { key: "justifiees", label: "Justifiées", slot: 1 },
                    { key: "retards", label: "Retards", slot: 3 },
                  ]}
                  valueFormat="integer"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Élèves les plus absents</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Élève</TH>
                      <TH>Classe</TH>
                      <TH className="text-right">Abs.</TH>
                      <TH className="text-right">Non just.</TH>
                      <TH className="text-right">Retards</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(absentees?.data ?? []).map((a) => (
                      <TR key={a.student_id}>
                        <TD>{fullName(a)}</TD>
                        <TD>{a.class_name}</TD>
                        <TD className="text-right tabular-nums">{a.absences}</TD>
                        <TD className="text-right tabular-nums">{a.unjustified}</TD>
                        <TD className="text-right tabular-nums">{a.lates}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {staffCount?.data && (
          <Card>
            <CardHeader>
              <CardTitle>Personnel</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">Effectif</dt>
                  <dd className="text-xl font-bold">{staffCount.data.length}</dd>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">Enseignants</dt>
                  <dd className="text-xl font-bold">{staffCount.data.filter((x) => x.is_teacher).length}</dd>
                </div>
                <div className="rounded-lg bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">Congés ({days} j)</dt>
                  <dd className="text-xl font-bold">{(leaves?.data ?? []).filter((l) => l.status === "approved").length}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}

        {finance && fin && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Recettes et recouvrement</CardTitle>
                <CardDescription>Taux de recouvrement : {formatPercent(Number(fin.billed) ? Number(fin.collected) / Number(fin.billed) : null, 1)}</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                  {[
                    ["Facturé", fin.billed],
                    ["Encaissé", fin.collected],
                    ["Impayés", fin.outstanding],
                    ["Dont échus", fin.overdue],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-lg bg-muted/60 p-3">
                      <dt className="text-xs text-muted-foreground">{k}</dt>
                      <dd className="font-bold tabular-nums">{formatMoney(Number(v), cur)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recettes et dépenses mensuelles</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChartView
                  label="Recettes et dépenses"
                  data={(cashflow?.data ?? []).map((m) => ({ mois: MONTH.format(new Date(`${m.month}T12:00:00`)), recettes: Number(m.collected), depenses: Number(m.spent) }))}
                  xKey="mois"
                  series={[
                    { key: "recettes", label: "Recettes", slot: 1 },
                    { key: "depenses", label: "Dépenses", slot: 2 },
                  ]}
                  valueFormat="money"
                  currency={cur}
                />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Dépenses par catégorie vs budget</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Catégorie</TH>
                      <TH className="text-right">Dépensé</TH>
                      <TH className="text-right">Budget</TH>
                      <TH className="text-right">Consommation</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(expenses?.data ?? []).map((e) => (
                      <TR key={e.category_id}>
                        <TD>{e.category_name}</TD>
                        <TD className="text-right tabular-nums">{formatMoney(Number(e.spent), cur)}</TD>
                        <TD className="text-right tabular-nums">{e.budget === null ? "—" : formatMoney(Number(e.budget), cur)}</TD>
                        <TD className="text-right tabular-nums">{e.budget ? formatPercent(Number(e.spent) / Number(e.budget)) : "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
