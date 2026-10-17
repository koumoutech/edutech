import { InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { createRequestAction } from "@/features/communication/actions";
import { RequestActions } from "@/features/communication/request-actions";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { formatDateTime, fullName } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { listRequests } from "@/server/services/communication";
import { linkedChildren } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Demandes administratives" };

const KINDS: Record<string, string> = {
  certificate: "Certificat / attestation",
  transcript: "Relevé de notes",
  transfer: "Transfert / radiation",
  appointment: "Demande de rendez-vous",
  information: "Information",
  complaint: "Réclamation",
  other: "Autre",
};
const STATUS: Record<string, { label: string; variant: "warning" | "default" | "muted" | "danger" | "solid" }> = {
  open: { label: "Ouverte", variant: "warning" },
  in_progress: { label: "En cours", variant: "default" },
  done: { label: "Traitée", variant: "solid" },
  rejected: { label: "Refusée", variant: "danger" },
  cancelled: { label: "Annulée", variant: "muted" },
};

export default async function RequestsPage() {
  const ctx = await requireContext();
  if (!can(ctx, "requests.create") && !can(ctx, "requests.manage")) redirect("/app/forbidden");
  const [items, children] = await Promise.all([
    listRequests(ctx),
    isFamilyOnly(ctx.school.roles) ? linkedChildren(ctx) : Promise.resolve([]),
  ]);
  const manage = canSchoolWide(ctx, "requests.manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Demandes administratives"
        description={
          manage
            ? "Demandes des familles et du personnel : certificats, rendez-vous, informations…"
            : "Certificats, rendez-vous, informations : suivez vos demandes."
        }
        actions={
          can(ctx, "requests.create") && (
            <FormDialog
              title="Nouvelle demande"
              action={createRequestAction}
              triggerLabel="Nouvelle demande"
              submitLabel="Envoyer"
            >
              <Field label="Type" htmlFor="rq-kind">
                <Select id="rq-kind" name="kind">
                  {Object.entries(KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              {children.length > 0 && (
                <Field label="Concerne" htmlFor="rq-student">
                  <Select id="rq-student" name="student_id" defaultValue={children[0].id}>
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {fullName(c)}
                      </option>
                    ))}
                    <option value="">Aucun enfant en particulier</option>
                  </Select>
                </Field>
              )}
              <Field label="Objet" htmlFor="rq-subject">
                <Input id="rq-subject" name="subject" required minLength={3} maxLength={160} />
              </Field>
              <Field label="Détails" htmlFor="rq-details">
                <Textarea id="rq-details" name="details" rows={4} maxLength={4000} />
              </Field>
              <Field label="Date souhaitée (rendez-vous)" htmlFor="rq-date">
                <Input id="rq-date" name="preferred_date" type="datetime-local" />
              </Field>
            </FormDialog>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={InboxIcon} title="Aucune demande" />
      ) : (
        <Card className="divide-y">
          {items.map((r) => (
            <div key={r.id} id={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{r.subject}</p>
                <p className="text-muted-foreground text-xs">
                  {KINDS[r.kind]} · {formatDateTime(r.created_at)}
                  {r.student ? ` · ${fullName(r.student)}` : ""}
                  {r.preferred_date ? ` · souhaité le ${formatDateTime(r.preferred_date)}` : ""}
                </p>
                {r.details && <p className="mt-1 text-sm whitespace-pre-line">{r.details}</p>}
                {r.resolution && <p className="bg-muted/60 mt-2 rounded-lg p-2 text-sm">Réponse : {r.resolution}</p>}
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Badge variant={STATUS[r.status]?.variant}>{STATUS[r.status]?.label}</Badge>
                <RequestActions id={r.id} status={r.status} manage={manage} mine={r.requester_id === ctx.user.id} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
