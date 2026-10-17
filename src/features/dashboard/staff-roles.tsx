import {
  AlertTriangleIcon,
  BriefcaseIcon,
  CalendarOffIcon,
  FileWarningIcon,
  GraduationCapIcon,
  InboxIcon,
  ReceiptIcon,
  UserPlusIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { BarChartView } from "@/components/charts/lazy";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { accountantData, hrData, recentAnnouncements, recentNotifications, secretaryData } from "@/server/services/dashboard";
import { AlertsList, AnnouncementsList, Greeting, NotificationsList, Section } from "./widgets";

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

export async function AccountantDashboard({ ctx }: { ctx: AppContext }) {
  const d = await accountantData(ctx);
  const cur = ctx.school.currency;
  const s = d.summary;
  const recovery = s && Number(s.billed) > 0 ? Number(s.collected) / Number(s.billed) : null;
  return (
    <div className="space-y-6">
      <Greeting name={ctx.user.fullName} subtitle={`Finances · ${d.year?.name ?? "aucune année configurée"}`} />
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Montant facturé" value={0} formatted={formatMoney(s?.billed, cur)} icon={ReceiptIcon} hint={`${s?.invoices ?? 0} factures`} href="/app/finance/invoices" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Encaissé"
            value={0}
            formatted={formatMoney(s?.collected, cur)}
            icon={WalletIcon}
            hint={recovery === null ? undefined : `Recouvrement : ${Math.round(recovery * 100)} %`}
            href="/app/finance/payments"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Reste dû" value={0} formatted={formatMoney(s?.outstanding, cur)} icon={AlertTriangleIcon} tone="warning" href="/app/finance/invoices?filter=open" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Impayés échus"
            value={0}
            formatted={formatMoney(s?.overdue, cur)}
            icon={AlertTriangleIcon}
            tone={Number(s?.overdue ?? 0) > 0 ? "danger" : "default"}
            hint={`${s?.overdue_invoices ?? 0} factures en retard`}
            href="/app/finance/invoices?filter=overdue"
          />
        </StaggerItem>
      </Stagger>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Trésorerie mensuelle" description="Encaissements nets et dépenses approuvées (6 mois)" className="lg:col-span-2">
          <BarChartView
            label="Encaissements et dépenses par mois"
            data={d.cashflow.map((m) => ({ mois: MONTH.format(new Date(`${m.month}T12:00:00`)), encaisse: Number(m.collected), depense: Number(m.spent) }))}
            xKey="mois"
            series={[
              { key: "encaisse", label: "Encaissements", slot: 1 },
              { key: "depense", label: "Dépenses", slot: 2 },
            ]}
            valueFormat="money"
            currency={cur}
          />
        </Section>
        <Section title="À traiter">
          <AlertsList
            alerts={[
              ...(d.unreconciled ? [{ label: "Paiements à rapprocher", count: d.unreconciled, href: "/app/finance/payments?filter=unreconciled", tone: "info" as const }] : []),
              ...d.alerts,
            ]}
          />
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Plus gros impayés échus" action={<Button asChild variant="ghost" size="sm"><Link href="/app/finance/invoices?filter=overdue">Tout voir</Link></Button>}>
          {d.overdue.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Facture</TH>
                  <TH>Élève</TH>
                  <TH>Échéance</TH>
                  <TH className="text-right">Reste dû</TH>
                </TR>
              </THead>
              <TBody>
                {d.overdue.map((i) => (
                  <TR key={i.id}>
                    <TD>
                      <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-primary">
                        {i.number}
                      </Link>
                    </TD>
                    <TD>{fullName(i.student)}</TD>
                    <TD>{formatDate(i.due_date)}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatMoney(i.balance, cur)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun impayé échu. 👏</p>
          )}
        </Section>
        <Section title="Budgets par catégorie" description="Dépenses approuvées / budget de l'année">
          {d.expenses.length ? (
            <ul className="space-y-3">
              {d.expenses.map((e) => {
                const budget = Number(e.budget ?? 0);
                const pct = budget > 0 ? (Number(e.spent) / budget) * 100 : 0;
                return (
                  <li key={e.category_id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="font-medium">{e.category_name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMoney(e.spent, cur)} / {budget ? formatMoney(budget, cur) : "—"}
                      </span>
                    </div>
                    <Progress value={pct} tone={pct > 100 ? "danger" : pct > 85 ? "warning" : "brand"} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune catégorie de dépense.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

export async function SecretaryDashboard({ ctx }: { ctx: AppContext }) {
  const [d, announcements] = await Promise.all([secretaryData(ctx), recentAnnouncements(ctx, 3)]);
  return (
    <div className="space-y-6">
      <Greeting name={ctx.user.fullName} subtitle={`Secrétariat · ${d.year?.name ?? ""}`} />
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Élèves inscrits" value={d.active} icon={GraduationCapIcon} href="/app/students" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Inscriptions ce mois" value={d.newThisMonth} icon={UserPlusIcon} href="/app/students/new" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Dossiers incomplets" value={d.incomplete.length} icon={FileWarningIcon} tone={d.incomplete.length ? "warning" : "default"} href="/app/students?filter=incomplete" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Demandes en cours" value={d.requests.length} icon={InboxIcon} href="/app/requests" />
        </StaggerItem>
      </Stagger>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Dossiers incomplets" description="Pièces obligatoires ou informations manquantes" className="lg:col-span-2">
          {d.incomplete.length ? (
            <ul className="divide-y">
              {d.incomplete.map((s) => (
                <li key={s.student_id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/app/students/${s.student_id}`} className="text-sm font-medium hover:text-primary">
                    {fullName(s)} <span className="text-xs text-muted-foreground">· {s.matricule}</span>
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {(s.missing ?? []).map((m) => (
                      <Badge key={m} variant="warning">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Tous les dossiers sont complets.</p>
          )}
        </Section>
        <Section title="À traiter">
          <AlertsList alerts={d.alerts} />
        </Section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Effectifs par niveau">
          <BarChartView
            label="Effectifs par niveau"
            data={d.byLevel.map((l) => ({ niveau: l.level_name, eleves: Number(l.students), capacite: Number(l.capacity) }))}
            xKey="niveau"
            series={[
              { key: "eleves", label: "Inscrits", slot: 1 },
              { key: "capacite", label: "Capacité", slot: 3 },
            ]}
            valueFormat="integer"
          />
        </Section>
        <Section title="Demandes administratives">
          {d.requests.length ? (
            <ul className="space-y-2">
              {d.requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/app/requests#${r.id}`} className="block rounded-lg border p-3 text-sm hover:bg-muted/50">
                    <p className="font-medium">{r.subject}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          )}
        </Section>
        <Section title="Transferts et départs récents">
          {d.transfers.length ? (
            <ul className="divide-y text-sm">
              {d.transfers.map((t) => (
                <li key={t.id} className="py-2">
                  <p className="font-medium">{fullName(t.student)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.status === "transferred" ? "Changement de classe / transfert" : "Départ"} · {formatDate(t.left_on)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun transfert récent.</p>
          )}
        </Section>
      </div>
      <Section title="Annonces">
        <AnnouncementsList items={announcements} />
      </Section>
    </div>
  );
}

const LEAVE_LABELS: Record<string, string> = {
  annual_leave: "Congé annuel",
  sick_leave: "Maladie",
  maternity: "Maternité",
  paternity: "Paternité",
  training: "Formation",
  unpaid: "Sans solde",
  absence: "Absence",
  other: "Autre",
};

export async function HrDashboard({ ctx }: { ctx: AppContext }) {
  const d = await hrData(ctx);
  return (
    <div className="space-y-6">
      <Greeting name={ctx.user.fullName} subtitle="Ressources humaines" />
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Membres du personnel" value={d.staff} icon={BriefcaseIcon} href="/app/staff" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Enseignants" value={d.teachers} icon={GraduationCapIcon} href="/app/staff?filter=teachers" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Demandes en attente" value={d.pending.length} icon={CalendarOffIcon} tone={d.pending.length ? "warning" : "default"} href="/app/staff/leaves" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Absents aujourd'hui" value={d.onLeave} icon={CalendarOffIcon} />
        </StaggerItem>
      </Stagger>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Demandes de congé à traiter">
          {d.pending.length ? (
            <ul className="divide-y">
              {d.pending.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <p className="font-medium">{fullName(l.staff)}</p>
                    <p className="text-xs text-muted-foreground">
                      {LEAVE_LABELS[l.kind] ?? l.kind} · du {formatDate(l.starts_on)} au {formatDate(l.ends_on)}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/app/staff/leaves">Examiner</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          )}
        </Section>
        <Section title="Contrats arrivant à échéance (60 j)">
          {d.ending.length ? (
            <ul className="divide-y text-sm">
              {d.ending.map((c) => (
                <li key={c.id} className="flex justify-between py-2">
                  <span className="font-medium">{fullName(c.staff)}</span>
                  <span className="text-muted-foreground">{formatDate(c.ends_on)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun contrat n&apos;arrive à échéance.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

/** Generic staff dashboard (supervisor, librarian, IT, administrative staff). */
export async function StaffDashboard({ ctx }: { ctx: AppContext }) {
  const [notifications, announcements] = await Promise.all([recentNotifications(ctx, 8), recentAnnouncements(ctx, 5)]);
  return (
    <div className="space-y-6">
      <Greeting name={ctx.user.fullName} subtitle={`${ctx.school.name} · ${ctx.school.roles.map((r) => r.name).join(", ")}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Notifications">
          {notifications.length ? <NotificationsList items={notifications} /> : <EmptyState icon={InboxIcon} title="Aucune notification" className="py-8" />}
        </Section>
        <Section title="Annonces">
          <AnnouncementsList items={announcements} />
        </Section>
      </div>
    </div>
  );
}

