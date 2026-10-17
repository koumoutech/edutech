import {
  CalendarXIcon,
  FileBadgeIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  NotebookPenIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, Progress } from "@/components/ui/misc";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { can } from "@/lib/authz";
import { formatDate, formatMoney, formatScore, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { linkedChildren, recentAnnouncements, recentNotifications, studentSnapshot } from "@/server/services/dashboard";
import { AnnouncementsList, Greeting, NotificationsList, Section } from "./widgets";

type Snapshot = Awaited<ReturnType<typeof studentSnapshot>>;

function SubjectAverages({ snap }: { snap: Snapshot }) {
  if (!snap.subjects.length)
    return <p className="text-muted-foreground text-sm">Aucune note publiée pour cette période.</p>;
  return (
    <ul className="space-y-3">
      {snap.subjects.map((s) => {
        const avg = s.average === null ? null : Number(s.average);
        return (
          <li key={s.subject_id}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">
                {s.subject_name}{" "}
                <span className="text-muted-foreground text-xs">coef. {formatScore(Number(s.coefficient))}</span>
              </span>
              <span className="font-semibold tabular-nums">{formatScore(avg)}/20</span>
            </div>
            <Progress value={((avg ?? 0) / 20) * 100} tone={avg !== null && avg < 10 ? "danger" : "brand"} />
          </li>
        );
      })}
    </ul>
  );
}

function RecentGrades({ snap }: { snap: Snapshot }) {
  if (!snap.recentGrades.length) return <p className="text-muted-foreground text-sm">Aucune note publiée.</p>;
  return (
    <ul className="divide-y">
      {snap.recentGrades.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{g.assessment?.title}</p>
            <p className="text-muted-foreground text-xs">
              {g.assessment?.cs?.subject?.name} · {formatDate(g.assessment?.held_on)}
            </p>
          </div>
          <span className="font-semibold tabular-nums">
            {g.is_absent ? (
              <Badge variant="muted">Absent</Badge>
            ) : (
              `${formatScore(g.score)}/${formatScore(g.assessment?.max_score)}`
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dashboard of a student: only their own published data (RLS `self` scope). */
export async function StudentDashboard({ ctx }: { ctx: AppContext }) {
  const studentId = ctx.school.student_id;
  if (!studentId) {
    return (
      <EmptyState
        icon={GraduationCapIcon}
        title="Dossier élève non relié"
        description="Contactez le secrétariat de votre établissement."
      />
    );
  }
  const [snap, announcements] = await Promise.all([studentSnapshot(ctx, studentId), recentAnnouncements(ctx, 3)]);
  return (
    <div className="space-y-6">
      <Greeting
        name={ctx.user.fullName}
        subtitle={`${snap.className ?? "Classe non affectée"}${snap.term ? ` · ${snap.term.name}` : ""}`}
      />
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard
            label="Moyenne générale"
            value={0}
            formatted={formatScore(snap.average)}
            suffix={snap.average === null ? undefined : "/20"}
            icon={GraduationCapIcon}
            href="/app/assessments"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Absences"
            value={snap.absences}
            icon={CalendarXIcon}
            tone={snap.absences > 3 ? "warning" : "default"}
            hint={`${snap.excused} justifiées · ${snap.lates} retards`}
            href="/app/attendance"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Évaluations à venir"
            value={snap.upcoming.length}
            icon={NotebookPenIcon}
            href="/app/assessments"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Bulletins publiés"
            value={snap.reportCards.length}
            icon={FileBadgeIcon}
            href="/app/report-cards"
          />
        </StaggerItem>
      </Stagger>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Mes moyennes par matière" description={snap.term?.name} className="lg:col-span-2">
          <SubjectAverages snap={snap} />
        </Section>
        <Section title="Prochaines évaluations">
          {snap.upcoming.length ? (
            <ul className="space-y-2">
              {snap.upcoming.map((a) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {a.cs?.subject?.name} · {formatDate(a.held_on)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Aucune évaluation programmée.</p>
          )}
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Dernières notes publiées">
          <RecentGrades snap={snap} />
        </Section>
        <Section title="Annonces">
          <AnnouncementsList items={announcements} />
        </Section>
      </div>
    </div>
  );
}

/** Dashboard of a parent: one card per linked child (RLS `linked` scope). */
export async function ParentDashboard({ ctx }: { ctx: AppContext }) {
  const children = await linkedChildren(ctx);
  const [snapshots, notifications, announcements] = await Promise.all([
    Promise.all(children.map((c) => studentSnapshot(ctx, c.id))),
    recentNotifications(ctx),
    recentAnnouncements(ctx, 3),
  ]);
  const totalDue = snapshots.reduce((s, x) => s + x.balance, 0);

  return (
    <div className="space-y-6">
      <Greeting name={ctx.user.fullName} subtitle={`${ctx.school.name} · Espace parent`} />
      {!children.length && (
        <EmptyState
          icon={HeartHandshakeIcon}
          title="Aucun enfant rattaché"
          description="Le rattachement de vos enfants est effectué par le secrétariat de l'établissement pour des raisons de sécurité."
        />
      )}
      {can(ctx, "finance.read") && children.length > 0 && (
        <Card className="border-highlight/50 bg-highlight/10 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <WalletIcon className="dark:text-highlight size-6 text-[#a37800]" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">Solde restant dû : {formatMoney(totalDue, ctx.school.currency)}</p>
            <p className="text-muted-foreground text-sm">
              Frais de scolarité de vos enfants pour l&apos;année en cours.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/app/finance">Voir les factures</Link>
          </Button>
        </Card>
      )}
      <Stagger className="grid gap-4 lg:grid-cols-2">
        {snapshots.map((snap) => (
          <StaggerItem key={snap.student?.id}>
            <Card className="overflow-hidden">
              <div className="bg-brand-soft/60 dark:bg-secondary/50 flex items-center gap-3 border-b p-4">
                <Avatar name={fullName(snap.student)} className="bg-card size-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fullName(snap.student)}</p>
                  <p className="text-muted-foreground text-xs">
                    {snap.className ?? "Classe non affectée"} · Matricule {snap.student?.matricule}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/app/children/${snap.student?.id}`}>Détails</Link>
                </Button>
              </div>
              <div className="grid grid-cols-3 divide-x border-b text-center">
                <div className="p-3">
                  <p className="text-lg font-bold tabular-nums">{formatScore(snap.average)}</p>
                  <p className="text-muted-foreground text-xs">Moyenne</p>
                </div>
                <div className="p-3">
                  <p className="text-lg font-bold tabular-nums">{snap.absences}</p>
                  <p className="text-muted-foreground text-xs">Absences</p>
                </div>
                <div className="p-3">
                  <p className="text-lg font-bold tabular-nums">{formatMoney(snap.balance, ctx.school.currency)}</p>
                  <p className="text-muted-foreground text-xs">Reste dû</p>
                </div>
              </div>
              <div className="p-4">
                <p className="mb-2 text-sm font-semibold">Derniers résultats</p>
                <RecentGrades snap={{ ...snap, recentGrades: snap.recentGrades.slice(0, 3) }} />
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
      <div className="grid gap-4 lg:grid-cols-2">
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
        <Section title="Annonces de l'établissement">
          <AnnouncementsList items={announcements} />
        </Section>
      </div>
    </div>
  );
}

export { SubjectAverages, RecentGrades };
