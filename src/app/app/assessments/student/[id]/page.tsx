import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BookOpenCheckIcon } from "lucide-react";
import { formatDate, formatScore, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { assessmentFrame, studentGrades } from "@/server/services/assessments";

export const metadata: Metadata = { title: "Notes de l'élève" };

export default async function StudentGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("grades.read");
  const { id } = await params;
  const sp = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: student } = await ctx.db
    .from("students")
    .select("id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (!student) notFound();
  const frame = await assessmentFrame(ctx);
  const term = frame.terms.find((t) => t.id === sp.term) ?? frame.currentTerm;
  if (!term) return <EmptyState icon={BookOpenCheckIcon} title="Aucune période" />;
  const { grades, subjects } = await studentGrades(ctx, id, term.id);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Notes" title={fullName(student)} description={term.name} />
      <div className="flex flex-wrap gap-2">
        {frame.terms.map((t) => (
          <Link
            key={t.id}
            href={`?term=${t.id}`}
            className={`rounded-full border px-3 py-1 text-sm ${t.id === term.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {t.name}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Moyennes par matière</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {subjects.map((s) => (
                <li key={s.subject_id} className="flex justify-between py-2">
                  <span>{s.subject_name}</span>
                  <span className="font-semibold tabular-nums">
                    {formatScore(s.average === null ? null : Number(s.average))}
                  </span>
                </li>
              ))}
              {subjects.length === 0 && <li className="text-muted-foreground py-2">Aucune note.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="pt-5">
            <Table>
              <THead>
                <TR>
                  <TH>Évaluation</TH>
                  <TH>Date</TH>
                  <TH>Statut</TH>
                  <TH className="text-right">Note</TH>
                </TR>
              </THead>
              <TBody>
                {grades.map((g) => (
                  <TR key={g.id}>
                    <TD>
                      <Link href={`/app/assessments/${g.assessment?.id}`} className="hover:text-primary font-medium">
                        {g.assessment?.title}
                      </Link>
                      <p className="text-muted-foreground text-xs">{g.assessment?.cs?.subject?.name}</p>
                    </TD>
                    <TD>{formatDate(g.assessment?.held_on)}</TD>
                    <TD>
                      <Badge variant="muted">{g.assessment?.status}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {g.is_absent ? "Abs." : `${formatScore(g.score)}/${formatScore(Number(g.assessment?.max_score))}`}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
