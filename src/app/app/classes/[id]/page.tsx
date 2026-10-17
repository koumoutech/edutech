import { CalendarClockIcon, ClipboardCheckIcon, NotebookPenIcon, Trash2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ConfirmDialogServerSafe } from "@/features/classes/class-actions";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { saveClassAction, saveClassSubjectAction } from "@/features/classes/actions";
import { can } from "@/lib/authz";
import { formatDate, formatScore, fullName } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { academicReferenceData, getClassDetail } from "@/server/services/academics";

export const metadata: Metadata = { title: "Classe" };

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  if (!can(ctx, "students.read") && !can(ctx, "academics.manage")) redirect("/app/forbidden");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getClassDetail(ctx, id).catch(() => null);
  if (!detail) notFound();
  const { cls, roster, subjects } = detail;
  const manage = can(ctx, "academics.manage", ["school"]);
  const ref = manage ? await academicReferenceData(ctx) : null;
  const teachers = (ref?.staff ?? []).filter((s) => s.is_teacher);
  const totalCoef = subjects.reduce((s, x) => s + Number(x.coefficient), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${cls.level?.name ?? ""} · ${cls.year?.name ?? ""}`}
        title={`Classe ${cls.name}`}
        description={`${roster.length} élève(s) / ${cls.capacity} places · Salle ${cls.room?.name ?? "—"} · Professeur principal : ${cls.homeroom ? fullName(cls.homeroom) : "—"}`}
        actions={
          <>
            {can(ctx, "attendance.create") && (
              <Button asChild size="sm">
                <Link href={`/app/attendance/take?class=${cls.id}`}>
                  <ClipboardCheckIcon /> Faire l&apos;appel
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/timetable?class=${cls.id}`}>
                <CalendarClockIcon /> Emploi du temps
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/assessments?class=${cls.id}`}>
                <NotebookPenIcon /> Évaluations
              </Link>
            </Button>
            {manage && ref && (
              <FormDialog
                title={`Modifier ${cls.name}`}
                action={saveClassAction}
                trigger={
                  <Button variant="outline" size="sm">
                    Modifier
                  </Button>
                }
              >
                <input type="hidden" name="id" value={cls.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nom" htmlFor="e-name">
                    <Input id="e-name" name="name" defaultValue={cls.name} required />
                  </Field>
                  <Field label="Capacité" htmlFor="e-cap">
                    <Input id="e-cap" name="capacity" type="number" min={1} defaultValue={cls.capacity} required />
                  </Field>
                </div>
                <Field label="Niveau" htmlFor="e-level">
                  <Select id="e-level" name="level_id" defaultValue={cls.level_id}>
                    {ref.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Salle" htmlFor="e-room">
                  <Select id="e-room" name="room_id" defaultValue={cls.room_id ?? ""}>
                    <option value="">—</option>
                    {ref.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Professeur principal" htmlFor="e-home">
                  <Select id="e-home" name="homeroom_staff_id" defaultValue={cls.homeroom_staff_id ?? ""}>
                    <option value="">—</option>
                    {teachers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fullName(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormDialog>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Élèves ({roster.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {roster.length ? (
              <ul className="divide-y">
                {roster.map((r, i) => (
                  <li key={r.id}>
                    <Link
                      href={`/app/students/${r.student!.id}`}
                      className="hover:text-primary flex items-center gap-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">{i + 1}</span>
                      <Avatar name={fullName(r.student)} className="size-8" />
                      <span className="flex-1 font-medium">{fullName(r.student)}</span>
                      <span className="text-muted-foreground hidden text-xs sm:inline">{r.student!.matricule}</span>
                      <span className="text-muted-foreground hidden text-xs sm:inline">
                        {formatDate(r.student!.birth_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Aucun élève affecté à cette classe.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Matières et enseignants</CardTitle>
            {manage && ref && (
              <FormDialog title="Ajouter un enseignement" action={saveClassSubjectAction} triggerLabel="Ajouter">
                <input type="hidden" name="class_id" value={cls.id} />
                <Field label="Matière" htmlFor="cs-subject">
                  <Select id="cs-subject" name="subject_id" required defaultValue="">
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {ref.subjects
                      .filter((s) => !subjects.some((x) => x.subject_id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Enseignant" htmlFor="cs-teacher">
                  <Select id="cs-teacher" name="teacher_id" defaultValue="">
                    <option value="">Non attribué</option>
                    {teachers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fullName(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Coefficient" htmlFor="cs-coef">
                    <Input
                      id="cs-coef"
                      name="coefficient"
                      type="number"
                      step="0.5"
                      min="0.5"
                      defaultValue={1}
                      required
                    />
                  </Field>
                  <Field label="Heures / semaine" htmlFor="cs-hours">
                    <Input id="cs-hours" name="weekly_hours" type="number" step="0.5" min="0" />
                  </Field>
                </div>
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Matière</TH>
                  <TH>Enseignant</TH>
                  <TH className="text-right">Coef.</TH>
                  {manage && <TH />}
                </TR>
              </THead>
              <TBody>
                {subjects.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: s.subject?.color ?? "var(--primary)" }}
                          aria-hidden
                        />
                        {s.subject?.name}
                      </span>
                    </TD>
                    <TD>{s.teacher ? fullName(s.teacher) : <Badge variant="warning">À attribuer</Badge>}</TD>
                    <TD className="text-right tabular-nums">{formatScore(Number(s.coefficient))}</TD>
                    {manage && ref && (
                      <TD className="text-right whitespace-nowrap">
                        <FormDialog
                          title={`${s.subject?.name} — ${cls.name}`}
                          action={saveClassSubjectAction}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Modifier
                            </Button>
                          }
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="class_id" value={cls.id} />
                          <input type="hidden" name="subject_id" value={s.subject_id} />
                          <Field label="Enseignant" htmlFor={`t-${s.id}`}>
                            <Select id={`t-${s.id}`} name="teacher_id" defaultValue={s.teacher_id ?? ""}>
                              <option value="">Non attribué</option>
                              {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {fullName(t)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Coefficient" htmlFor={`c-${s.id}`}>
                              <Input
                                id={`c-${s.id}`}
                                name="coefficient"
                                type="number"
                                step="0.5"
                                min="0.5"
                                defaultValue={Number(s.coefficient)}
                              />
                            </Field>
                            <Field label="Heures / semaine" htmlFor={`h-${s.id}`}>
                              <Input
                                id={`h-${s.id}`}
                                name="weekly_hours"
                                type="number"
                                step="0.5"
                                min="0"
                                defaultValue={s.weekly_hours ?? ""}
                              />
                            </Field>
                          </div>
                        </FormDialog>
                        <ConfirmDialogServerSafe
                          classSubjectId={s.id}
                          label={s.subject?.name ?? ""}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label="Retirer">
                              <Trash2Icon />
                            </Button>
                          }
                        />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="text-muted-foreground mt-3 text-xs">Total des coefficients : {formatScore(totalCoef)}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
