import { AlertTriangleIcon, SchoolIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Alert, EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { saveClassAction } from "@/features/classes/actions";
import { classLoadStatus, teacherOverloads } from "@/features/classes/domain";
import { can, canSchoolWide } from "@/lib/authz";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { getCurrentYear, listTeacherAssignments } from "@/server/repositories/academic";
import { academicReferenceData, classesOverview } from "@/server/services/academics";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const ctx = await requireContext();
  if (!can(ctx, "students.read") && !can(ctx, "academics.manage")) redirect("/app/forbidden");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  if (!year) {
    return <EmptyState icon={SchoolIcon} title="Aucune année scolaire" description="Configurez l'année scolaire dans les paramètres." />;
  }
  const overview = await classesOverview(ctx, year.id);
  let classes = overview.classes;
  if (!canSchoolWide(ctx, "students.read") && ctx.school.staff_id) {
    const mine = new Set((await listTeacherAssignments(ctx.db, ctx.school.staff_id, year.id)).map((a) => a.class?.id));
    classes = classes.filter((c) => mine.has(c.id) || c.homeroom?.id === ctx.school.staff_id);
  }
  const manage = can(ctx, "academics.manage", ["school"]);
  const ref = manage ? await academicReferenceData(ctx) : null;
  const overloads = manage ? teacherOverloads(overview.assignments, overview.contractHours) : new Map();
  const staffName = new Map((ref?.staff ?? []).map((s) => [s.id, fullName(s)]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description={`Année scolaire ${year.name} · ${classes.length} classe(s)`}
        actions={
          manage &&
          ref && (
            <FormDialog title="Nouvelle classe" action={saveClassAction} triggerLabel="Nouvelle classe">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom" htmlFor="c-name">
                  <Input id="c-name" name="name" required placeholder="6e A" />
                </Field>
                <Field label="Capacité" htmlFor="c-cap">
                  <Input id="c-cap" name="capacity" type="number" min={1} max={200} defaultValue={40} required />
                </Field>
              </div>
              <Field label="Niveau" htmlFor="c-level">
                <Select id="c-level" name="level_id" required defaultValue="">
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {ref.levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Salle principale" htmlFor="c-room">
                <Select id="c-room" name="room_id" defaultValue="">
                  <option value="">—</option>
                  {ref.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Professeur principal" htmlFor="c-home">
                <Select id="c-home" name="homeroom_staff_id" defaultValue="">
                  <option value="">—</option>
                  {ref.staff
                    .filter((s) => s.is_teacher)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {fullName(s)}
                      </option>
                    ))}
                </Select>
              </Field>
            </FormDialog>
          )
        }
      />

      {overloads.size > 0 && (
        <Alert tone="warning" title="Surcharge d'enseignants détectée">
          <ul className="list-disc pl-5">
            {[...overloads.entries()].map(([id, o]) => (
              <li key={id}>
                {staffName.get(id) ?? "Enseignant"} : {o.assigned} h/semaine attribuées pour {o.max} h prévues au contrat.
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {classes.length === 0 ? (
        <EmptyState icon={SchoolIcon} title="Aucune classe" description={manage ? "Créez les classes de l'année en cours." : "Aucune classe ne vous est attribuée."} />
      ) : (
        <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const status = classLoadStatus({ id: c.id, name: c.name, capacity: c.capacity, enrolled: c.enrolled });
            return (
              <StaggerItem key={c.id}>
                <Link href={`/app/classes/${c.id}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-bold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.level?.name}
                          {c.room?.name ? ` · ${c.room.name}` : ""}
                        </p>
                      </div>
                      {status === "full" || status === "over" ? (
                        <Badge variant="danger">
                          <AlertTriangleIcon /> {status === "over" ? "Surchargée" : "Complète"}
                        </Badge>
                      ) : status === "near_full" ? (
                        <Badge variant="warning">Presque complète</Badge>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm">
                      <UsersIcon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="font-semibold tabular-nums">{c.enrolled}</span>
                      <span className="text-muted-foreground">/ {c.capacity} places</span>
                    </div>
                    <Progress className="mt-2" value={(c.enrolled / c.capacity) * 100} tone={status === "ok" ? "brand" : status === "near_full" ? "warning" : "danger"} />
                    <p className="mt-3 text-xs text-muted-foreground">Professeur principal : {c.homeroom ? fullName(c.homeroom) : "non désigné"}</p>
                  </Card>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
