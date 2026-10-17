import { CalendarClockIcon, FileBadgeIcon, NotebookPenIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { RecentGrades, SubjectAverages } from "@/features/dashboard/family";
import { Section } from "@/features/dashboard/widgets";
import { can } from "@/lib/authz";
import { formatDate, formatMoney, formatScore, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { studentSnapshot } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Suivi de mon enfant" };

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("students.read", ["linked"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const snap = await studentSnapshot(ctx, id);
  if (!snap.student) notFound(); // RLS: not one of the parent's children
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`Matricule ${snap.student.matricule}`} title={fullName(snap.student)} description={`${snap.className ?? "Classe non affectée"} · ${snap.term?.name ?? ""}`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Moyenne", `${formatScore(snap.average)}/20`],
          ["Absences", String(snap.absences)],
          ["Retards", String(snap.lates)],
          ["Reste dû", formatMoney(snap.balance, ctx.school.currency)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-xl font-bold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><Link href={`/app/assessments`}><NotebookPenIcon /> Résultats</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href={`/app/report-cards`}><FileBadgeIcon /> Bulletins</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href={`/app/timetable`}><CalendarClockIcon /> Emploi du temps</Link></Button>
        {can(ctx, "finance.read") && <Button asChild variant="outline" size="sm"><Link href="/app/finance"><WalletIcon /> Frais</Link></Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Moyennes par matière" description={snap.term?.name}>
          <SubjectAverages snap={snap} />
        </Section>
        <Section title="Dernières notes publiées">
          <RecentGrades snap={snap} />
        </Section>
        <Section title="Évaluations à venir">
          {snap.upcoming.length ? (
            <ul className="space-y-2 text-sm">
              {snap.upcoming.map((a) => (
                <li key={a.id} className="rounded-lg border p-3">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.cs?.subject?.name} · {formatDate(a.held_on)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune évaluation programmée.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
