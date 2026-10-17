import { MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormDialog } from "@/components/inline-form";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { startThreadAction } from "@/features/communication/actions";
import { cn, formatDateTime } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { listThreads, messageRecipients } from "@/server/services/communication";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const ctx = await requirePermission("messages.create");
  const [threads, recipients] = await Promise.all([listThreads(ctx), messageRecipients(ctx)]);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Messages"
        description="Échanges entre familles et personnel. Les familles ne peuvent écrire qu'au personnel de l'établissement."
        actions={
          <FormDialog title="Nouveau message" action={startThreadAction} triggerLabel="Nouveau message" submitLabel="Envoyer">
            <Field label="Objet" htmlFor="m-subject">
              <Input id="m-subject" name="subject" required maxLength={160} />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Destinataires</legend>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border p-2">
                {recipients.map((r) => (
                  <label key={r.user_id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" name="recipients" value={r.user_id} className="size-4 accent-[var(--primary)]" />
                    <span className="flex-1">{r.full_name}</span>
                    <span className="text-xs text-muted-foreground">{r.role_names}</span>
                  </label>
                ))}
                {recipients.length === 0 && <p className="text-sm text-muted-foreground">Aucun destinataire disponible.</p>}
              </div>
            </fieldset>
            <Field label="Message" htmlFor="m-body">
              <Textarea id="m-body" name="body" required rows={5} maxLength={5000} />
            </Field>
          </FormDialog>
        }
      />
      {threads.length === 0 ? (
        <EmptyState icon={MessagesSquareIcon} title="Aucune conversation" />
      ) : (
        <Card className="divide-y overflow-hidden">
          {threads.map((t) => (
            <Link key={t.id} href={`/app/messages/${t.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
              <span className={cn("size-2.5 shrink-0 rounded-full", t.unread ? "bg-primary" : "bg-transparent")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate", t.unread && "font-semibold")}>{t.subject}</p>
                <p className="text-xs text-muted-foreground">
                  {t.message_participants.length} participant(s) · {formatDateTime(t.last_message_at)}
                </p>
              </div>
              {t.unread && <span className="sr-only">Non lu</span>}
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
