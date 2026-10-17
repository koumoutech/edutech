import { AlertTriangleIcon, CalendarCheckIcon, GraduationCapIcon, TrendingUpIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { AreaChartView, BarChartView } from "@/components/charts/lazy";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, formatPercent, formatScore, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { directionData, recentAnnouncements } from "@/server/services/dashboard";
import { AlertsList, AnnouncementsList, Greeting, Section } from "./widgets";

export async function DirectionDashboard({ ctx, academicOnly = false }: { ctx: AppContext; academicOnly?: boolean }) {
  const [d, announcements] = await Promise.all([directionData(ctx), recentAnnouncements(ctx, 3)]);
  const totalStudents = d.byLevel.reduce((s, l) => s + Number(l.students), 0);
  const girls = d.byLevel.reduce((s, l) => s + Number(l.girls), 0);
  const att = d.attendance.reduce(
    (acc, r) => ({ p: acc.p + Number(r.present) + Number(r.late), t: acc.t + Number(r.present) + Number(r.absent) + Number(r.late) + Number(r.excused) }),
    { p: 0, t: 0 },
  );
  const attendanceRate = att.t ? att.p / att.t : null;
  const schoolAverage = d.performance.length
    ? d.performance.reduce((s, c) => s + Number(c.average) * Number(c.students), 0) / d.performance.reduce((s, c) => s + Number(c.students), 0)
    : null;
  const showFinance = !academicOnly && canSchoolWide(ctx, "finance.read") && d.finance;
  const recovery = d.finance && Number(d.finance.billed) > 0 ? Number(d.finance.collected) / Number(d.finance.billed) : null;

  return (
    <div className="space-y-6">
      <Greeting
        name={ctx.user.fullName}
        subtitle={`${ctx.school.name}${d.year ? ` · Année ${d.year.name}` : ""}${d.term ? ` · ${d.term.name}` : ""}`}
      />
      {!d.year && (
        <EmptyState
          icon={GraduationCapIcon}
          title="Aucune année scolaire configurée"
          description="Créez l'année scolaire, ses périodes et vos classes pour commencer."
          action={
            can(ctx, "academics.manage") ? (
              <Button asChild>
                <Link href="/app/settings/academics">Configurer l&apos;année</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Élèves inscrits" value={totalStudents} icon={GraduationCapIcon} hint={totalStudents ? `${formatPercent(girls / totalStudents)} de filles` : undefined} href="/app/students" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Taux de présence (30 j)"
            value={attendanceRate === null ? 0 : Math.round(attendanceRate * 1000) / 10}
            formatted={attendanceRate === null ? "—" : undefined}
            suffix={attendanceRate === null ? undefined : "%"}
            icon={CalendarCheckIcon}
            tone={attendanceRate !== null && attendanceRate < 0.9 ? "warning" : "default"}
            hint={attendanceRate === null ? "Aucun appel enregistré" : `${att.t} pointages`}
            href="/app/attendance"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label={`Moyenne générale${d.term ? ` · ${d.term.name}` : ""}`}
            value={0}
            formatted={schoolAverage === null ? "—" : formatScore(schoolAverage)}
            suffix={schoolAverage === null ? undefined : "/20"}
            icon={TrendingUpIcon}
            hint={schoolAverage === null ? "Aucune note validée" : "Évaluations validées et publiées"}
            href="/app/reports"
          />
        </StaggerItem>
        <StaggerItem>
          {showFinance ? (
            <StatCard
              label="Taux de recouvrement"
              value={recovery === null ? 0 : Math.round(recovery * 1000) / 10}
              suffix="%"
              icon={WalletIcon}
              tone={recovery !== null && recovery < 0.7 ? "warning" : "default"}
              hint={`Reste dû : ${formatMoney(d.finance!.outstanding, ctx.school.currency)}`}
              href="/app/finance"
            />
          ) : (
            <StatCard label="Alertes à traiter" value={d.alerts.reduce((s, a) => s + a.count, 0)} icon={AlertTriangleIcon} tone={d.alerts.length ? "warning" : "default"} />
          )}
        </StaggerItem>
      </Stagger>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Présences des 30 derniers jours" description="Élèves présents (y compris retards) et absents par jour d'appel" className="lg:col-span-2">
          {d.attendance.length ? (
            <BarChartView
              label="Présences par jour"
              data={d.attendance.map((r) => ({
                jour: formatDate(r.day, { day: "2-digit", month: "2-digit", year: undefined }),
                presents: Number(r.present) + Number(r.late),
                absents: Number(r.absent) + Number(r.excused),
              }))}
              xKey="jour"
              stacked
              series={[
                { key: "presents", label: "Présents", slot: 1 },
                { key: "absents", label: "Absents", slot: 2 },
              ]}
            />
          ) : (
            <EmptyState icon={CalendarCheckIcon} title="Aucun appel enregistré" description="Les statistiques apparaîtront après les premiers appels." />
          )}
        </Section>
        <Section title="À traiter" description="Décisions et validations en attente">
          <AlertsList alerts={d.alerts} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Résultats par classe" description={d.term ? `Moyenne des élèves — ${d.term.name}` : undefined}>
          {d.performance.length ? (
            <BarChartView
              label="Moyenne par classe"
              data={d.performance.map((c) => ({ classe: c.class_name, moyenne: Number(c.average) }))}
              xKey="classe"
              series={[{ key: "moyenne", label: "Moyenne /20", slot: 1 }]}
              yDomain={[0, 20]}
              valueFormat="score"
            />
          ) : (
            <EmptyState icon={TrendingUpIcon} title="Pas encore de résultats validés" />
          )}
        </Section>
        <Section title="Répartition des élèves" description="Effectifs par niveau (filles / garçons)">
          {d.byLevel.some((l) => Number(l.students) > 0) ? (
            <BarChartView
              label="Effectifs par niveau"
              data={d.byLevel.map((l) => ({ niveau: l.level_name, filles: Number(l.girls), garcons: Number(l.boys) }))}
              xKey="niveau"
              stacked
              series={[
                { key: "filles", label: "Filles", slot: 1 },
                { key: "garcons", label: "Garçons", slot: 3 },
              ]}
              valueFormat="integer"
            />
          ) : (
            <EmptyState icon={GraduationCapIcon} title="Aucun élève inscrit" />
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {d.termAverages.length >= 2 ? (
          <Section title="Évolution des performances" description="Moyenne générale par trimestre" className="lg:col-span-2">
            <AreaChartView
              label="Évolution de la moyenne par trimestre"
              data={d.termAverages.map((t) => ({ periode: t.term_name, moyenne: Number(t.average) }))}
              xKey="periode"
              series={[{ key: "moyenne", label: "Moyenne /20", slot: 1 }]}
              yDomain={[0, 20]}
            />
          </Section>
        ) : (
          <Section title="Élèves les plus absents (30 j)" className="lg:col-span-2">
            {d.absentees.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Élève</TH>
                    <TH>Classe</TH>
                    <TH className="text-right">Absences</TH>
                    <TH className="text-right">Non justifiées</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.absentees.map((a) => (
                    <TR key={a.student_id}>
                      <TD>
                        <Link href={`/app/students/${a.student_id}`} className="font-medium hover:text-primary">
                          {fullName(a)}
                        </Link>
                      </TD>
                      <TD>{a.class_name}</TD>
                      <TD className="text-right tabular-nums">{a.absences}</TD>
                      <TD className="text-right tabular-nums">{a.unjustified}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune absence sur la période.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">La comparaison entre trimestres s&apos;affichera dès que deux trimestres auront des notes validées.</p>
          </Section>
        )}
        <Section title="Annonces récentes" action={<Button asChild variant="ghost" size="sm"><Link href="/app/announcements">Tout voir</Link></Button>}>
          <AnnouncementsList items={announcements} />
        </Section>
      </div>

      {showFinance && d.finance && (
        <Section title="Indicateurs financiers" description="Année en cours — montants facturés, encaissés et restant dus">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Facturé", d.finance.billed],
              ["Encaissé", d.finance.collected],
              ["Reste dû", d.finance.outstanding],
              ["Dont en retard", d.finance.overdue],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-muted/60 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-bold tabular-nums">{formatMoney(Number(value), ctx.school.currency)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </div>
  );
}
