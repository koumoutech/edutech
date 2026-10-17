import { NotebookPenIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { saveAssessmentAction } from "@/features/grades/actions";
import { FamilyGrades } from "@/features/grades/family-grades";
import { ASSESSMENT_STATUS } from "@/features/grades/labels";
import { can, isFamilyOnly } from "@/lib/authz";
import { formatDate, formatScore, isoDate } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { listClasses } from "@/server/repositories/academic";
import { assessmentFrame, listAssessments, listQuerySchema, writableClassSubjects } from "@/server/services/assessments";

export const metadata: Metadata = { title: "Évaluations & notes" };


export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext();
  if (!can(ctx, "assessments.read") && !can(ctx, "grades.read")) redirect("/app/forbidden");
  const sp = await searchParams;
  if (isFamilyOnly(ctx.school.roles)) return <FamilyGrades ctx={ctx} termParam={sp.term} />;

  const query = listQuerySchema.parse(sp);
  const frame = await assessmentFrame(ctx);
  const termId = query.term ?? frame.currentTerm?.id;
  const [rows, writable, classes, types] = await Promise.all([
    listAssessments(ctx, query, termId),
    frame.year ? writableClassSubjects(ctx, frame.year.id) : [],
    frame.year ? listClasses(ctx.db, ctx.school.id, frame.year.id) : [],
    ctx.db.from("assessment_types").select("id, name, default_coefficient").eq("school_id", ctx.school.id).order("name"),
  ]);
  const visibleClasses = classes.filter((c) => rows.some((r) => r.cs?.class_id === c.id) || writable.some((w) => w.class?.id === c.id) || query.class === c.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Évaluations & notes"
        description="Saisie, validation et publication des résultats."
        actions={
          writable.length > 0 &&
          frame.terms.length > 0 && (
            <FormDialog title="Nouvelle évaluation" action={saveAssessmentAction} triggerLabel="Nouvelle évaluation">
              <Field label="Classe et matière" htmlFor="a-cs">
                <Select id="a-cs" name="class_subject_id" required defaultValue="">
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {writable.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.class?.name} — {w.subject?.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Intitulé" htmlFor="a-title">
                <Input id="a-title" name="title" required maxLength={160} placeholder="Devoir n°2 — Fractions" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" htmlFor="a-type">
                  <Select id="a-type" name="assessment_type_id" defaultValue="">
                    <option value="">—</option>
                    {(types.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Période" htmlFor="a-term">
                  <Select id="a-term" name="term_id" defaultValue={frame.currentTerm?.id}>
                    {frame.terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="a-date">
                  <Input id="a-date" name="held_on" type="date" defaultValue={isoDate()} required />
                </Field>
                <Field label="Barème (sur)" htmlFor="a-max">
                  <Input id="a-max" name="max_score" type="number" min={1} step="0.5" defaultValue={20} required />
                </Field>
                <Field label="Coefficient" htmlFor="a-coef">
                  <Input id="a-coef" name="coefficient" type="number" min={0.5} step="0.5" defaultValue={1} required />
                </Field>
              </div>
            </FormDialog>
          )
        }
      />

      <Card className="p-3">
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Select name="term" defaultValue={termId} aria-label="Période">
            {frame.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select name="class" defaultValue={query.class ?? ""} aria-label="Classe">
            <option value="">Toutes les classes</option>
            {visibleClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={query.status ?? ""} aria-label="Statut">
            <option value="">Tous les statuts</option>
            {Object.entries(ASSESSMENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={NotebookPenIcon} title="Aucune évaluation" description="Créez une évaluation pour commencer la saisie des notes." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Évaluation</TH>
                <TH>Classe</TH>
                <TH className="hidden md:table-cell">Date</TH>
                <TH className="hidden md:table-cell">Barème</TH>
                <TH className="hidden sm:table-cell">Notes</TH>
                <TH>Statut</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <Link href={`/app/assessments/${a.id}`} className="font-medium hover:text-primary">
                      {a.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {a.cs?.subject?.name}
                      {a.type?.name ? ` · ${a.type.name}` : ""} · coef. {formatScore(Number(a.coefficient))}
                    </p>
                  </TD>
                  <TD>{a.cs?.class?.name}</TD>
                  <TD className="hidden md:table-cell">{formatDate(a.held_on)}</TD>
                  <TD className="hidden md:table-cell">/{formatScore(Number(a.max_score))}</TD>
                  <TD className="hidden tabular-nums sm:table-cell">{a.grades?.[0]?.count ?? 0}</TD>
                  <TD>
                    <Badge variant={ASSESSMENT_STATUS[a.status]?.variant}>{ASSESSMENT_STATUS[a.status]?.label}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
