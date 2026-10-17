import { ClipboardCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StaffRollCall } from "@/features/staff/staff-roll-call";
import { canSchoolWide } from "@/lib/authz";
import { formatDate, isoDate } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { staffAttendanceDay, staffAttendanceSummary } from "@/server/services/staff";

export const metadata: Metadata = { title: "Pointage du personnel" };

export default async function StaffAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await requirePermission("staff.read", ["school"]);
  const today = isoDate();
  const { date: raw } = await searchParams;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const monthStart = `${date.slice(0, 7)}-01`;
  const [day, summary] = await Promise.all([
    staffAttendanceDay(ctx, date),
    staffAttendanceSummary(ctx, monthStart, date),
  ]);
  const editable = canSchoolWide(ctx, "staff.manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pointage du personnel"
        description="Présences, retards et absences quotidiennes. Les congés approuvés sont pré-renseignés."
        actions={
          <form className="flex items-center gap-2" method="get">
            <label htmlFor="sa-date" className="sr-only">
              Date
            </label>
            <Input id="sa-date" type="date" name="date" defaultValue={date} max={today} className="w-auto" />
            <Button type="submit" variant="outline">
              Afficher
            </Button>
          </form>
        }
      />
      <p className="text-sm font-medium">
        {formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>
      {day.staff.length === 0 ? (
        <EmptyState
          icon={ClipboardCheckIcon}
          title="Aucun membre du personnel actif"
          description="Ajoutez d'abord les fiches du personnel."
        />
      ) : (
        <StaffRollCall
          key={date}
          date={date}
          staff={day.staff}
          existing={day.records}
          onLeave={day.onLeave}
          editable={editable}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Synthèse du mois (jusqu&apos;au {formatDate(date)})</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune absence ni aucun retard enregistré sur la période.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Membre du personnel</TH>
                  <TH className="text-right">Absences</TH>
                  <TH className="text-right">Retards</TH>
                  <TH className="text-right">Minutes de retard</TH>
                  <TH className="text-right">Jours de congé</TH>
                </TR>
              </THead>
              <TBody>
                {summary.map((s) => (
                  <TR key={s.staff_id}>
                    <TD className="font-medium">{s.name}</TD>
                    <TD className="text-right tabular-nums">{s.absent}</TD>
                    <TD className="text-right tabular-nums">{s.late}</TD>
                    <TD className="text-right tabular-nums">{s.minutesLate}</TD>
                    <TD className="text-right tabular-nums">{s.onLeave}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
