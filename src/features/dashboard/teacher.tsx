import {
  BookOpenCheckIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  NotebookPenIcon,
  SchoolIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { formatDate, formatScore, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { recentAnnouncements, recentNotifications, teacherData } from "@/server/services/dashboard";
import { AnnouncementsList, Greeting, NotificationsList, Section } from "./widgets";

export async function TeacherDashboard({ ctx }: { ctx: AppContext }) {
  const [d, notifications, announcements] = await Promise.all([
    teacherData(ctx),
    recentNotifications(ctx),
    recentAnnouncements(ctx, 3),
  ]);
  const classes = new Map<string, string>();
  for (const a of d.assignments) if (a.class) classes.set(a.class.id, a.class.name);
  const totalStudents = [...classes.keys()].reduce((s, id) => s + (d.classSizes[id] ?? 0), 0);

  if (!ctx.school.staff_id) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Fiche enseignant non reliée"
        description="Votre compte n'est pas encore relié à une fiche du personnel. Demandez au secrétariat de vous envoyer une invitation liée à votre fiche."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Greeting name={ctx.user.fullName} subtitle={`${ctx.school.name}${d.term ? ` · ${d.term.name}` : ""}`} />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Classes attribuées"
            value={classes.size}
            icon={SchoolIcon}
            hint={`${d.assignments.length} enseignements`}
            href="/app/classes"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Élèves suivis" value={totalStudents} icon={UsersIcon} href="/app/students" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Appels à effectuer"
            value={d.rollCalls.length}
            icon={ClipboardCheckIcon}
            tone={d.rollCalls.length ? "warning" : "default"}
            hint="Cours d'aujourd'hui sans appel"
            href="/app/attendance"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Évaluations en cours"
            value={d.toGrade.length}
            icon={NotebookPenIcon}
            hint="Brouillons et soumises"
            href="/app/assessments"
          />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Mon emploi du temps du jour"
          className="lg:col-span-2"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/timetable">Semaine</Link>
            </Button>
          }
        >
          {d.today.length ? (
            <ol className="space-y-2">
              {d.today.map((t) => {
                const done = !d.rollCalls.some((r) => r.id === t.id);
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">
                      {t.starts_at.slice(0, 5)}
                      <span className="text-muted-foreground block text-xs font-normal">{t.ends_at.slice(0, 5)}</span>
                    </div>
                    <span
                      className="h-10 w-1 rounded-full"
                      style={{ background: t.cs?.subject?.color ?? "var(--primary)" }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.cs?.subject?.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {t.class?.name}
                        {t.room?.name ? ` · ${t.room.name}` : ""}
                      </p>
                    </div>
                    {done ? (
                      <Badge>Appel fait</Badge>
                    ) : (
                      <Button asChild size="sm">
                        <Link href={`/app/attendance/take?class=${t.class_id}&entry=${t.id}`}>Faire l&apos;appel</Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon={CalendarClockIcon} title="Aucun cours aujourd'hui" className="py-8" />
          )}
        </Section>
        <Section
          title="Notifications"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/notifications">Tout voir</Link>
            </Button>
          }
        >
          <NotificationsList items={notifications} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Notes à saisir" description="Évaluations en brouillon ou soumises" className="lg:col-span-1">
          {d.toGrade.length ? (
            <ul className="space-y-2">
              {d.toGrade.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/app/assessments/${a.id}`}
                    className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <BookOpenCheckIcon className="text-primary size-4 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="text-muted-foreground text-xs">{formatDate(a.held_on)}</p>
                    </div>
                    <Badge variant={a.status === "submitted" ? "warning" : "muted"}>
                      {a.status === "submitted" ? "Soumise" : "Brouillon"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Toutes vos évaluations sont à jour.</p>
          )}
        </Section>
        <Section
          title="Élèves en difficulté"
          description="Moyenne inférieure au seuil de réussite (notes de vos classes)"
        >
          {d.atRisk.length ? (
            <ul className="divide-y">
              {d.atRisk.map((s) => (
                <li key={s.student_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/app/students/${s.student_id}`} className="hover:text-primary truncate font-medium">
                    {fullName(s)} <span className="text-muted-foreground text-xs font-normal">· {s.class_name}</span>
                  </Link>
                  <Badge variant="danger">{formatScore(Number(s.average))}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Aucun élève sous le seuil pour cette période.</p>
          )}
        </Section>
        <Section title="Annonces">
          <AnnouncementsList items={announcements} />
        </Section>
      </div>
    </div>
  );
}
