import { CalendarCheckIcon, ClipboardCheckIcon, DownloadIcon, FileCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Stagger, StaggerItem } from "@/components/ui/motion";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { JustificationForm } from "@/features/attendance/justification-form";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { formatDate, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { requireContext } from "@/server/auth/session";
import { attendanceOverview, studentAttendanceHistory } from "@/server/services/attendance";
import { linkedChildren } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Présences" };

const STATUS: Record<string, { label: string; variant: "danger" | "warning" | "default" | "muted" }> = {
  absent: { label: "Absent", variant: "danger" },
  late: { label: "Retard", variant: "warning" },
  excused: { label: "Justifiée", variant: "default" },
  present: { label: "Présent", variant: "muted" },
};
const JUSTIF: Record<string, { label: string; variant: "warning" | "default" | "danger" }> = {
  pending: { label: "En attente", variant: "warning" },
  accepted: { label: "Acceptée", variant: "default" },
  rejected: { label: "Refusée", variant: "danger" },
};

export default async function AttendancePage() {
  const ctx = await requireContext();
  if (!can(ctx, "attendance.read") && !can(ctx, "attendance.create")) redirect("/app/forbidden");
  if (isFamilyOnly(ctx.school.roles)) return <FamilyAttendance ctx={ctx} />;
  const data = await attendanceOverview(ctx);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Présences"
        description="Appel du jour, justificatifs et suivi de l'assiduité."
        actions={
          <>
            {can(ctx, "justifications.validate") && (
              <Button asChild variant="outline">
                <Link href="/app/attendance/justifications">
                  <FileCheckIcon /> Justificatifs {data.pendingJustifications > 0 && <Badge variant="warning">{data.pendingJustifications}</Badge>}
                </Link>
              </Button>
            )}
            {can(ctx, "attendance.export") && canSchoolWide(ctx, "attendance.read") && (
              <Button asChild variant="outline">
                <a href="/api/export/attendance" download>
                  <DownloadIcon /> Exporter (30 j)
                </a>
              </Button>
            )}
          </>
        }
      />
      {data.classes.length === 0 ? (
        <EmptyState icon={ClipboardCheckIcon} title="Aucune classe" description="Aucune classe ne vous est attribuée pour l'appel." />
      ) : (
        <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.classes.map((c) => (
            <StaggerItem key={c.id}>
              <Card className="flex items-center gap-3 p-4">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-primary dark:bg-secondary">
                  <CalendarCheckIcon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name}</p>
                  {c.today ? (
                    <p className="text-xs text-muted-foreground">
                      Appel fait · {c.today.absent} absent(s) · {c.today.late} retard(s)
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-[#a37800] dark:text-highlight">Appel du jour non effectué</p>
                  )}
                </div>
                {can(ctx, "attendance.create") && (
                  <Button asChild size="sm" variant={c.today ? "outline" : "default"}>
                    <Link href={`/app/attendance/take?class=${c.id}`}>{c.today ? "Modifier" : "Appel"}</Link>
                  </Button>
                )}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

async function FamilyAttendance({ ctx }: { ctx: AppContext }) {
  const children = await linkedChildren(ctx);
  const histories = await Promise.all(children.map(async (c) => ({ child: c, ...(await studentAttendanceHistory(ctx, c.id)) })));
  return (
    <div className="space-y-5">
      <PageHeader title="Absences et retards" description="Historique et justification des absences." />
      {can(ctx, "justifications.create") && children.length > 0 && (
        <JustificationForm students={children.map((c) => ({ id: c.id, name: fullName(c) }))} />
      )}
      {histories.map(({ child, records, justifications }) => (
        <Card key={child.id}>
          <CardHeader>
            <CardTitle>{fullName(child)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {records.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Cours</TH>
                    <TH>Statut</TH>
                  </TR>
                </THead>
                <TBody>
                  {records.map((r) => (
                    <TR key={r.id}>
                      <TD>{formatDate(r.session?.date)}</TD>
                      <TD>{r.session?.cs?.subject?.name ?? "Journée"}</TD>
                      <TD>
                        <Badge variant={STATUS[r.status]?.variant ?? "muted"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                        {r.minutes_late ? <span className="ml-2 text-xs text-muted-foreground">{r.minutes_late} min</span> : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune absence ni retard enregistré. 👏</p>
            )}
            {justifications.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Justificatifs envoyés</p>
                <ul className="space-y-2">
                  {justifications.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                      <span>
                        Du {formatDate(j.from_date)} au {formatDate(j.to_date)} — {j.reason}
                        {j.review_comment && <span className="block text-xs text-muted-foreground">Commentaire : {j.review_comment}</span>}
                      </span>
                      <Badge variant={JUSTIF[j.status]?.variant ?? "warning"}>{JUSTIF[j.status]?.label ?? j.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
