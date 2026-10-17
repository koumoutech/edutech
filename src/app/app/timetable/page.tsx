import { CalendarClockIcon } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { addEntryAction, addSubstitutionAction } from "@/features/timetable/actions";
import { DeleteEntryButton, PrintButton } from "@/features/timetable/entry-actions";
import { WeekGrid } from "@/features/timetable/week-grid";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { formatDate, fullName, isoDate, WEEKDAYS } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { defaultView, timetableOptions, weekTimetable, type TimetableView } from "@/server/services/timetable";

export const metadata: Metadata = { title: "Emploi du temps" };

const viewSchema = z.object({
  class: z.uuid().optional().catch(undefined),
  teacher: z.uuid().optional().catch(undefined),
  room: z.uuid().optional().catch(undefined),
});

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("timetable.read");
  const sp = viewSchema.parse(await searchParams);
  const family = isFamilyOnly(ctx.school.roles);
  let view: TimetableView | null = sp.class ? { kind: "class", id: sp.class } : sp.teacher ? { kind: "teacher", id: sp.teacher } : sp.room ? { kind: "room", id: sp.room } : null;
  if (family || !view) view = view && !family ? view : await defaultView(ctx);
  if (family && sp.class) view = { kind: "class", id: sp.class }; // RLS filters entries of non-linked classes anyway
  const options = await timetableOptions(ctx);
  const manage = canSchoolWide(ctx, "timetable.manage");

  if (!view) {
    return <EmptyState icon={CalendarClockIcon} title="Aucun emploi du temps" description="Aucune classe ou aucun cours n'est encore planifié." />;
  }
  const data = await weekTimetable(ctx, view);
  const label =
    view.kind === "class"
      ? `Classe ${options.classes.find((c) => c.id === view.id)?.name ?? ""}`
      : view.kind === "teacher"
        ? options.teachers.find((t) => t.id === view.id)?.name ?? "Enseignant"
        : `Salle ${options.rooms.find((r) => r.id === view.id)?.name ?? ""}`;
  const subsByEntry = new Map(data.substitutions.map((s) => [s.timetable_entry_id, s]));
  const hasSaturday = data.entries.some((e) => e.weekday === 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Emploi du temps"
        description={label}
        actions={
          <>
            <PrintButton />
            {manage && options.classSubjects.length > 0 && (
              <FormDialog title="Ajouter un créneau" action={addEntryAction} triggerLabel="Ajouter un créneau">
                <Field label="Classe et matière" htmlFor="t-cs">
                  <Select id="t-cs" name="class_subject_id" required defaultValue="">
                    <option value="" disabled>
                      Choisir…
                    </option>
                    {options.classSubjects
                      .filter((c) => view.kind !== "class" || c.classId === view.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Jour" htmlFor="t-day">
                    <Select id="t-day" name="weekday">
                      {WEEKDAYS.slice(0, 6).map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Début" htmlFor="t-start">
                    <Input id="t-start" name="starts_at" type="time" required defaultValue="08:00" />
                  </Field>
                  <Field label="Fin" htmlFor="t-end">
                    <Input id="t-end" name="ends_at" type="time" required defaultValue="09:00" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Salle" htmlFor="t-room">
                    <Select id="t-room" name="room_id" defaultValue="">
                      <option value="">—</option>
                      {options.rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Enseignant" htmlFor="t-teacher" hint="Par défaut : enseignant de la matière">
                    <Select id="t-teacher" name="teacher_id" defaultValue="">
                      <option value="">Par défaut</option>
                      {options.teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </FormDialog>
            )}
          </>
        }
      />

      {!family && (
        <Card className="no-print p-3">
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Select name="class" defaultValue={view.kind === "class" ? view.id : ""} aria-label="Classe">
              <option value="">Par classe…</option>
              {options.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select name="teacher" defaultValue={view.kind === "teacher" ? view.id : ""} aria-label="Enseignant">
              <option value="">Par enseignant…</option>
              {options.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select name="room" defaultValue={view.kind === "room" ? view.id : ""} aria-label="Salle">
              <option value="">Par salle…</option>
              {options.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Afficher
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Choisissez un seul critère à la fois (le premier renseigné est utilisé).</p>
        </Card>
      )}

      {data.entries.length === 0 ? (
        <EmptyState icon={CalendarClockIcon} title="Aucun cours planifié" />
      ) : (
        <WeekGrid
          days={hasSaturday ? 6 : 5}
          entries={data.entries.map((e) => {
            const sub = subsByEntry.get(e.id);
            return {
              id: e.id,
              weekday: e.weekday,
              starts_at: e.starts_at,
              ends_at: e.ends_at,
              title: e.cs?.subject?.name ?? "",
              subtitle: [view.kind !== "class" ? e.class?.name : null, view.kind !== "teacher" && e.teacher ? fullName(e.teacher) : null, e.room?.name].filter(Boolean).join(" · "),
              color: e.cs?.subject?.color ?? null,
              badge: sub ? (sub.is_cancelled ? `Annulé le ${formatDate(sub.date)}` : `Remplacé le ${formatDate(sub.date)}`) : undefined,
            };
          })}
          actions={manage ? (e) => <DeleteEntryButton id={e.id} /> : undefined}
        />
      )}

      {(data.substitutions.length > 0 || manage) && (
        <Card className="no-print">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Remplacements et annulations à venir</CardTitle>
            {manage && data.entries.length > 0 && (
              <FormDialog title="Remplacement ou annulation" action={addSubstitutionAction} triggerLabel="Déclarer" triggerVariant="outline">
                <Field label="Cours" htmlFor="s-entry">
                  <Select id="s-entry" name="timetable_entry_id" required>
                    {data.entries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {WEEKDAYS[e.weekday - 1]} {e.starts_at.slice(0, 5)} — {e.cs?.subject?.name} ({e.class?.name})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="s-date">
                  <Input id="s-date" name="date" type="date" min={isoDate()} required />
                </Field>
                <Field label="Remplaçant" htmlFor="s-sub">
                  <Select id="s-sub" name="substitute_teacher_id" defaultValue="">
                    <option value="">—</option>
                    {options.teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_cancelled" className="size-4 accent-[var(--primary)]" /> Cours annulé
                </label>
                <Field label="Motif / message aux familles" htmlFor="s-reason">
                  <Textarea id="s-reason" name="reason" maxLength={300} rows={2} />
                </Field>
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            {data.substitutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun changement prévu.</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.substitutions.map((s) => {
                  const e = data.entries.find((x) => x.id === s.timetable_entry_id);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {formatDate(s.date)} · {e?.cs?.subject?.name} ({e?.class?.name}) {s.reason ? `— ${s.reason}` : ""}
                      </span>
                      {s.is_cancelled ? <Badge variant="danger">Annulé</Badge> : <Badge>Remplaçant : {s.substitute ? fullName(s.substitute) : "—"}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {!can(ctx, "timetable.manage") && <p className="no-print text-xs text-muted-foreground">Les modifications d&apos;emploi du temps vous sont notifiées automatiquement.</p>}
    </div>
  );
}
