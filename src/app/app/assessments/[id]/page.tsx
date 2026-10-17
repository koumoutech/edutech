import { HistoryIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AssessmentWorkflow, CorrectGradeButton } from "@/features/grades/assessment-actions";
import { GradeSheet } from "@/features/grades/grade-sheet";
import { ASSESSMENT_STATUS } from "@/features/grades/labels";
import { can } from "@/lib/authz";
import { formatDate, formatDateTime, formatScore, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { getAssessmentSheet } from "@/server/services/assessments";

export const metadata: Metadata = { title: "Saisie des notes" };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("assessments.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const sheet = await getAssessmentSheet(ctx, id).catch(() => null);
  if (!sheet) notFound();
  const a = sheet.assessment;
  const locked = ["validated", "published"].includes(a.status);
  const names = new Map(sheet.students.map((s) => [s.id, fullName(s)]));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${a.cs?.class?.name} · ${a.cs?.subject?.name} · ${a.term?.name}`}
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={ASSESSMENT_STATUS[a.status]?.variant}>{ASSESSMENT_STATUS[a.status]?.label}</Badge>
            <span>
              {formatDate(a.held_on)} · barème /{formatScore(Number(a.max_score))} · coef. {formatScore(Number(a.coefficient))}
              {a.cs?.teacher ? ` · ${fullName(a.cs.teacher)}` : ""}
            </span>
          </span>
        }
        actions={
          <AssessmentWorkflow
            id={a.id}
            status={a.status}
            canSubmit={sheet.canSubmit}
            canValidate={sheet.canValidate}
            canPublish={sheet.canPublish}
            canUnpublish={sheet.canUnpublish}
            canDelete={a.status === "draft" && can(ctx, "assessments.delete") && sheet.canWrite}
          />
        }
      />

      {locked && (
        <Alert tone="info" title="Notes verrouillées">
          <span className="inline-flex items-center gap-1">
            <LockIcon className="size-3.5" aria-hidden /> Évaluation validée le {formatDateTime(a.validated_at)}.
          </span>{" "}
          {sheet.canCorrect ? "Utilisez le bouton de correction : chaque modification est motivée et historisée." : "Seule la direction des études peut corriger une note validée."}
        </Alert>
      )}

      {locked ? (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Élève</TH>
                <TH className="text-right">Note</TH>
                <TH className="hidden sm:table-cell">Appréciation</TH>
                {sheet.canCorrect && <TH />}
              </TR>
            </THead>
            <TBody>
              {sheet.students.map((s) => {
                const g = sheet.grades.find((x) => x.student_id === s.id);
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">{fullName(s)}</TD>
                    <TD className="text-right tabular-nums">
                      {g ? g.is_absent ? <Badge variant="muted">Absent</Badge> : `${formatScore(g.score)}/${formatScore(Number(a.max_score))}` : "—"}
                    </TD>
                    <TD className="hidden text-sm text-muted-foreground sm:table-cell">{g?.comment}</TD>
                    {sheet.canCorrect && (
                      <TD className="text-right">
                        {g && <CorrectGradeButton gradeId={g.id} studentName={fullName(s)} score={g.score === null ? null : Number(g.score)} isAbsent={g.is_absent} maxScore={Number(a.max_score)} />}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ) : (
        <GradeSheet
          assessmentId={a.id}
          maxScore={Number(a.max_score)}
          students={sheet.students}
          grades={sheet.grades.map((g) => ({ ...g, score: g.score === null ? null : Number(g.score) }))}
          readOnly={!sheet.canWrite}
        />
      )}

      {sheet.revisions.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle>Historique des corrections</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {sheet.revisions.map((r) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <span className="font-medium">{names.get(r.student_id) ?? "Élève"}</span> : {formatScore(r.old_score)} → {formatScore(r.new_score)}
                  <span className="text-muted-foreground"> · {formatDateTime(r.changed_at)}</span>
                  {r.assessment_status !== "draft" && r.assessment_status !== "submitted" && <Badge variant="warning" className="ml-2">après validation</Badge>}
                  {r.reason && <p className="mt-1 text-xs text-muted-foreground">Motif : {r.reason}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
