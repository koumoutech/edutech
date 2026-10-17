import { FileDownIcon, MessageSquareTextIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConfirmDialog } from "@/components/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { saveAppreciationAction } from "@/features/grades/actions";
import { REPORT_CARD_STATUS } from "@/features/grades/labels";
import { canSchoolWide } from "@/lib/authz";
import { formatScore, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { getReportCard } from "@/server/services/assessments";

export const metadata: Metadata = { title: "Bulletin" };

const n = (v: number | null) => (v === null ? null : Number(v));

export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("report_cards.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const rc = await getReportCard(ctx, id).catch(() => null);
  if (!rc) notFound();
  const editable = rc.status === "draft" && canSchoolWide(ctx, "report_cards.create");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${rc.class?.name} · ${rc.term?.name}`}
        title={`Bulletin — ${fullName(rc.student)}`}
        description={<Badge variant={REPORT_CARD_STATUS[rc.status]?.variant}>{REPORT_CARD_STATUS[rc.status]?.label}</Badge>}
        actions={
          <>
            {editable && (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <MessageSquareTextIcon /> Appréciation
                  </Button>
                }
                title="Appréciation du conseil de classe"
                confirmLabel="Enregistrer"
                action={saveAppreciationAction.bind(null, rc.id)}
              >
                <Field label="Appréciation" htmlFor="appreciation">
                  <Textarea id="appreciation" name="appreciation" defaultValue={rc.appreciation ?? ""} maxLength={1000} rows={4} />
                </Field>
                <Field label="Décision (facultatif)" htmlFor="decision">
                  <Input id="decision" name="decision" defaultValue={rc.decision ?? ""} maxLength={200} placeholder="Félicitations, encouragements, avertissement…" />
                </Field>
              </ConfirmDialog>
            )}
            <Button asChild size="sm">
              <a href={`/api/report-cards/${rc.id}`} target="_blank" rel="noopener">
                <FileDownIcon /> PDF
              </a>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Moyenne générale", `${formatScore(n(rc.average))}/20`],
          ["Rang", rc.rank ? `${rc.rank}/${rc.class_size}` : "—"],
          ["Moyenne de la classe", formatScore(n(rc.class_average))],
          ["Absences / retards", `${rc.absences_count} / ${rc.lates_count}`],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-xl font-bold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Matière</TH>
              <TH className="text-center">Coef.</TH>
              <TH className="text-right">Moyenne</TH>
              <TH className="hidden text-right sm:table-cell">Classe</TH>
              <TH className="hidden text-center md:table-cell">Min / Max</TH>
              <TH className="text-center">Rang</TH>
            </TR>
          </THead>
          <TBody>
            {rc.report_card_lines.map((l) => (
              <TR key={l.subject_id}>
                <TD>
                  <p className="font-medium">{l.subject_name}</p>
                  {l.teacher_name && <p className="text-xs text-muted-foreground">{l.teacher_name}</p>}
                </TD>
                <TD className="text-center tabular-nums">{formatScore(Number(l.coefficient))}</TD>
                <TD className="text-right font-semibold tabular-nums">{formatScore(n(l.average))}</TD>
                <TD className="hidden text-right tabular-nums sm:table-cell">{formatScore(n(l.class_average))}</TD>
                <TD className="hidden text-center tabular-nums md:table-cell">
                  {formatScore(n(l.min_average))} / {formatScore(n(l.max_average))}
                </TD>
                <TD className="text-center tabular-nums">{l.rank ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appréciation{rc.mention ? ` · ${rc.mention}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{rc.appreciation || <span className="text-muted-foreground">Aucune appréciation saisie.</span>}</p>
          {rc.decision && (
            <p>
              <strong>Décision :</strong> {rc.decision}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
