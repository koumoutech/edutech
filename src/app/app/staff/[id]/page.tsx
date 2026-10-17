import { FileTextIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DocumentUpload } from "@/features/documents/document-upload";
import { addContractAction, addEvaluationAction, saveStaffAction } from "@/features/staff/actions";
import { CONTRACT_TYPES, LEAVE_KINDS, LEAVE_STATUS } from "@/features/staff/labels";
import { StaffFormFields } from "@/features/staff/staff-form-fields";
import { canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, formatScore, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { getStaff } from "@/server/services/staff";

export const metadata: Metadata = { title: "Dossier du personnel" };

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("staff.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await getStaff(ctx, id).catch(() => null);
  if (!d) notFound();
  const s = d.staff;
  const hrManage = canSchoolWide(ctx, "hr.manage");
  const weekly = d.assignments.reduce((sum, a) => sum + Number(a.weekly_hours ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={s.employee_number}
        title={fullName(s)}
        description={`${s.job_title}${s.department ? ` · ${s.department}` : ""}${s.hire_date ? ` · depuis le ${formatDate(s.hire_date)}` : ""}`}
        actions={
          canSchoolWide(ctx, "staff.manage") && (
            <FormDialog title="Modifier la fiche" action={saveStaffAction} trigger={<Button variant="outline" size="sm">Modifier</Button>}>
              <StaffFormFields d={s} />
            </FormDialog>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{s.email ?? "—"}</p>
            <p>{s.phone ?? "—"}</p>
            <div className="flex gap-1">
              {s.is_teacher && <Badge>Enseignant</Badge>}
              {s.user_id ? <Badge variant="muted">Compte actif</Badge> : <Badge variant="outline">Sans compte</Badge>}
            </div>
            {d.qualifications.length > 0 && (
              <div className="pt-2">
                <p className="font-semibold">Qualifications</p>
                <ul className="list-disc pl-5">
                  {d.qualifications.map((q) => (
                    <li key={q.id}>
                      {q.title}
                      {q.institution ? ` — ${q.institution}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Affectations {weekly ? `· ${formatScore(weekly)} h/semaine` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            {d.assignments.length ? (
              <ul className="flex flex-wrap gap-2">
                {d.assignments.map((a) => (
                  <li key={a.id}>
                    <Badge variant="outline">
                      {a.class?.name} · {a.subject?.name}
                      {a.weekly_hours ? ` (${a.weekly_hours} h)` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune affectation d&apos;enseignement.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {d.hr ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <LockIcon className="size-4 text-muted-foreground" aria-hidden /> Contrats
              </CardTitle>
              {hrManage && (
                <FormDialog title="Nouveau contrat" action={addContractAction} triggerLabel="Ajouter">
                  <input type="hidden" name="staff_id" value={s.id} />
                  <Field label="Type" htmlFor="c-type">
                    <Select id="c-type" name="contract_type">
                      {Object.entries(CONTRACT_TYPES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Début" htmlFor="c-start">
                      <Input id="c-start" name="starts_on" type="date" required />
                    </Field>
                    <Field label="Fin" htmlFor="c-end">
                      <Input id="c-end" name="ends_on" type="date" />
                    </Field>
                    <Field label={`Salaire mensuel (${ctx.school.currency})`} htmlFor="c-sal">
                      <Input id="c-sal" name="monthly_salary" type="number" min={0} step="any" />
                    </Field>
                    <Field label="Heures / semaine" htmlFor="c-hours">
                      <Input id="c-hours" name="weekly_hours" type="number" min={0} step="0.5" />
                    </Field>
                  </div>
                </FormDialog>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH>Période</TH>
                    <TH className="text-right">Salaire</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.contracts.map((c) => (
                    <TR key={c.id}>
                      <TD>{CONTRACT_TYPES[c.contract_type]}</TD>
                      <TD>
                        {formatDate(c.starts_on)} → {c.ends_on ? formatDate(c.ends_on) : "indéterminée"}
                      </TD>
                      <TD className="text-right tabular-nums">{c.monthly_salary === null ? "—" : formatMoney(Number(c.monthly_salary), ctx.school.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <LockIcon className="size-4 text-muted-foreground" aria-hidden /> Évaluations professionnelles
              </CardTitle>
              {hrManage && !d.isSelf && (
                <FormDialog title="Nouvelle évaluation" action={addEvaluationAction} triggerLabel="Ajouter">
                  <input type="hidden" name="staff_id" value={s.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Période" htmlFor="ev-period">
                      <Input id="ev-period" name="period_label" required placeholder="2026-2027" />
                    </Field>
                    <Field label="Note /20" htmlFor="ev-score">
                      <Input id="ev-score" name="score" type="number" min={0} max={20} step="0.5" />
                    </Field>
                  </div>
                  <Field label="Points forts" htmlFor="ev-str">
                    <Textarea id="ev-str" name="strengths" rows={2} />
                  </Field>
                  <Field label="Axes d'amélioration" htmlFor="ev-imp">
                    <Textarea id="ev-imp" name="improvements" rows={2} />
                  </Field>
                </FormDialog>
              )}
            </CardHeader>
            <CardContent>
              {d.evaluations.length ? (
                <ul className="space-y-2 text-sm">
                  {d.evaluations.map((e) => (
                    <li key={e.id} className="rounded-lg border p-3">
                      <p className="font-semibold">
                        {e.period_label} {e.score !== null && <Badge className="ml-1">{formatScore(Number(e.score))}/20</Badge>}
                      </p>
                      {e.strengths && <p className="mt-1">+ {e.strengths}</p>}
                      {e.improvements && <p className="mt-1 text-muted-foreground">→ {e.improvements}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune évaluation.</p>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-muted-foreground" aria-hidden /> Documents RH
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(hrManage || d.isSelf) && <DocumentUpload staffId={s.id} category="hr" />}
              <ul className="divide-y text-sm">
                {d.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between py-2">
                    <span>{doc.title}</span>
                    <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener" className="text-primary hover:underline">
                      Ouvrir
                    </a>
                  </li>
                ))}
                {d.documents.length === 0 && <li className="py-2 text-muted-foreground">Aucun document.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockIcon className="size-4" aria-hidden /> Les informations RH (contrats, rémunération, évaluations) sont réservées aux personnes habilitées.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Congés et absences</CardTitle>
        </CardHeader>
        <CardContent>
          {d.leaves.length ? (
            <ul className="divide-y text-sm">
              {d.leaves.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {LEAVE_KINDS[l.kind]} · du {formatDate(l.starts_on)} au {formatDate(l.ends_on)}
                  </span>
                  <Badge variant={LEAVE_STATUS[l.status]?.variant}>{LEAVE_STATUS[l.status]?.label}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune demande.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
