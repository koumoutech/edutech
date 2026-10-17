import { FileCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { reviewJustificationAction } from "@/features/attendance/actions";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { pendingJustifications } from "@/server/services/attendance";

export const metadata: Metadata = { title: "Justificatifs d'absence" };

export default async function JustificationsPage() {
  const ctx = await requirePermission("justifications.validate");
  const items = await pendingJustifications(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Justificatifs d'absence"
        description="Les justificatifs acceptés transforment les absences de la période en absences justifiées."
      />
      {items.length === 0 ? (
        <EmptyState icon={FileCheckIcon} title="Aucun justificatif" />
      ) : (
        <Card className="divide-y">
          {items.map((j) => (
            <div key={j.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <Link href={`/app/students/${j.student?.id}`} className="hover:text-primary">
                    {fullName(j.student)}
                  </Link>
                </p>
                <p className="text-sm">
                  Du {formatDate(j.from_date)} au {formatDate(j.to_date)} — {j.reason}
                </p>
                <p className="text-muted-foreground text-xs">Reçu le {formatDateTime(j.submitted_at)}</p>
              </div>
              {j.document_id && (
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/documents/${j.document_id}`} target="_blank" rel="noopener">
                    Pièce jointe
                  </a>
                </Button>
              )}
              {j.status === "pending" ? (
                <div className="flex gap-2">
                  <ConfirmDialog
                    trigger={<Button size="sm">Accepter</Button>}
                    title="Accepter le justificatif"
                    confirmLabel="Accepter"
                    action={reviewJustificationAction.bind(null, j.id, "accepted", "")}
                  />
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        Refuser
                      </Button>
                    }
                    title="Refuser le justificatif"
                    tone="destructive"
                    confirmLabel="Refuser"
                    reason={{ label: "Motif du refus (communiqué à la famille)", minLength: 3 }}
                    action={reviewJustificationAction.bind(null, j.id, "rejected")}
                  />
                </div>
              ) : (
                <Badge variant={j.status === "accepted" ? "default" : "danger"}>
                  {j.status === "accepted" ? "Acceptée" : "Refusée"}
                </Badge>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
