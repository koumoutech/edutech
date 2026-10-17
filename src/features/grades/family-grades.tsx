import { BookOpenCheckIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatScore, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { assessmentFrame, studentGrades } from "@/server/services/assessments";
import { linkedChildren } from "@/server/services/dashboard";

/** Published results of the student (self) or of the parent's children (linked). */
export async function FamilyGrades({ ctx, termParam, studentId }: { ctx: AppContext; termParam?: string; studentId?: string }) {
  const frame = await assessmentFrame(ctx);
  const term = frame.terms.find((t) => t.id === termParam) ?? frame.currentTerm;
  const children = studentId ? (await linkedChildren(ctx)).filter((c) => c.id === studentId) : await linkedChildren(ctx);
  if (!term) return <EmptyState icon={BookOpenCheckIcon} title="Aucune période configurée" />;
  const data = await Promise.all(children.map(async (c) => ({ child: c, ...(await studentGrades(ctx, c.id, term.id)) })));

  return (
    <div className="space-y-5">
      <PageHeader title="Résultats scolaires" description="Seules les notes publiées par l'établissement sont visibles." />
      <div className="flex flex-wrap gap-2">
        {frame.terms.map((t) => (
          <Link
            key={t.id}
            href={`?term=${t.id}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${t.id === term.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            aria-current={t.id === term.id ? "true" : undefined}
          >
            {t.name}
          </Link>
        ))}
      </div>
      {data.map(({ child, grades, subjects }) => {
        const weighted = subjects.reduce(
          (acc, s) => (s.average === null ? acc : { sum: acc.sum + Number(s.average) * Number(s.coefficient), w: acc.w + Number(s.coefficient) }),
          { sum: 0, w: 0 },
        );
        const avg = weighted.w ? weighted.sum / weighted.w : null;
        return (
          <Card key={child.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{fullName(child)}</CardTitle>
              <Badge variant={avg !== null && avg < 10 ? "danger" : "solid"}>Moyenne : {formatScore(avg)}/20</Badge>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                {subjects.length === 0 && <p className="text-sm text-muted-foreground">Aucune note publiée pour cette période.</p>}
                {subjects.map((s) => (
                  <div key={s.subject_id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{s.subject_name}</span>
                      <span className="font-semibold tabular-nums">{formatScore(s.average === null ? null : Number(s.average))}/20</span>
                    </div>
                    <Progress value={(Number(s.average ?? 0) / 20) * 100} tone={Number(s.average ?? 0) < 10 ? "danger" : "brand"} />
                  </div>
                ))}
              </div>
              {grades.length > 0 && (
                <Table>
                  <THead>
                    <TR>
                      <TH>Évaluation</TH>
                      <TH>Date</TH>
                      <TH className="text-right">Note</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {grades
                      .sort((a, b) => (b.assessment?.held_on ?? "").localeCompare(a.assessment?.held_on ?? ""))
                      .map((g) => (
                        <TR key={g.id}>
                          <TD>
                            <p className="font-medium">{g.assessment?.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {g.assessment?.cs?.subject?.name} · coef. {formatScore(Number(g.assessment?.coefficient))}
                            </p>
                            {g.comment && <p className="text-xs italic">« {g.comment} »</p>}
                          </TD>
                          <TD>{formatDate(g.assessment?.held_on)}</TD>
                          <TD className="text-right font-semibold tabular-nums">
                            {g.is_absent ? <Badge variant="muted">Absent</Badge> : `${formatScore(g.score)}/${formatScore(Number(g.assessment?.max_score))}`}
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
