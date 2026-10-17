import { CalendarOffIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requestLeaveAction } from "@/features/staff/actions";
import { LEAVE_KINDS, LEAVE_STATUS } from "@/features/staff/labels";
import { CancelLeaveButton, LeaveReview } from "@/features/staff/leave-review";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, fullName, isoDate } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { listLeaves, listStaff } from "@/server/services/staff";

export const metadata: Metadata = { title: "Congés & absences du personnel" };

export default async function LeavesPage() {
  const ctx = await requireContext();
  if (!can(ctx, "leaves.read") && !can(ctx, "leaves.create")) redirect("/app/forbidden");
  const [leaves, staff] = await Promise.all([
    can(ctx, "leaves.read") ? listLeaves(ctx) : [],
    canSchoolWide(ctx, "staff.read") ? listStaff(ctx, {}) : [],
  ]);
  const validator = canSchoolWide(ctx, "leaves.validate");
  const teachers = staff.filter((s) => s.is_teacher).map((s) => ({ id: s.id, name: fullName(s) }));
  const today = isoDate();
  const absentToday = leaves.filter((l) => l.status === "approved" && l.starts_on <= today && l.ends_on >= today);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Congés & absences du personnel"
        description="Déclarations, demandes, circuit de validation et remplacements."
        actions={
          can(ctx, "leaves.create") && (
            <FormDialog title="Nouvelle demande" action={requestLeaveAction} triggerLabel="Nouvelle demande">
              {canSchoolWide(ctx, "leaves.create") && staff.length > 0 && (
                <Field label="Membre du personnel" htmlFor="lv-staff" hint="Par défaut : vous-même">
                  <Select id="lv-staff" name="staff_id" defaultValue="">
                    <option value="">Moi-même</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fullName(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Type" htmlFor="lv-kind">
                <Select id="lv-kind" name="kind">
                  {Object.entries(LEAVE_KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Du" htmlFor="lv-from">
                  <Input id="lv-from" name="starts_on" type="date" defaultValue={today} required />
                </Field>
                <Field label="Au" htmlFor="lv-to">
                  <Input id="lv-to" name="ends_on" type="date" defaultValue={today} required />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="half_day" className="size-4 accent-[var(--primary)]" /> Demi-journée
              </label>
              <Field label="Motif" htmlFor="lv-reason">
                <Textarea id="lv-reason" name="reason" rows={3} maxLength={1000} />
              </Field>
            </FormDialog>
          )
        }
      />

      {absentToday.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Absents aujourd&apos;hui</p>
          <div className="flex flex-wrap gap-2">
            {absentToday.map((l) => (
              <Badge key={l.id} variant="warning">
                {fullName(l.staff)} · {LEAVE_KINDS[l.kind]}
                {l.substitute ? ` · remplacé(e) par ${fullName(l.substitute)}` : ""}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {leaves.length === 0 ? (
        <EmptyState icon={CalendarOffIcon} title="Aucune demande" />
      ) : (
        <Card className="divide-y">
          {leaves.map((l) => (
            <div key={l.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {fullName(l.staff)} <span className="font-normal text-muted-foreground">· {l.staff?.job_title}</span>
                </p>
                <p className="text-sm">
                  {LEAVE_KINDS[l.kind]} · du {formatDate(l.starts_on)} au {formatDate(l.ends_on)}
                  {l.half_day ? " (demi-journée)" : ""}
                </p>
                {l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}
                {l.review_comment && <p className="text-xs text-muted-foreground">Commentaire : {l.review_comment}</p>}
              </div>
              <Badge variant={LEAVE_STATUS[l.status]?.variant}>{LEAVE_STATUS[l.status]?.label}</Badge>
              {l.status === "pending" && validator && l.staff_id !== ctx.school.staff_id && <LeaveReview id={l.id} staff={fullName(l.staff)} teachers={teachers} />}
              {l.status === "pending" && l.created_by === ctx.user.id && <CancelLeaveButton id={l.id} />}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
