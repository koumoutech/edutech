import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { ReplyForm, ThreadLive } from "@/features/communication/thread-live";
import { cn, formatDateTime } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { getThread } from "@/server/services/communication";

export const metadata: Metadata = { title: "Conversation" };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("messages.create");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getThread(ctx, id).catch(() => null);
  if (!data) notFound();
  const names = new Map(data.participants.map((p) => [p.user_id, p.full_name]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={data.thread.subject} description={`Participants : ${data.participants.map((p) => p.full_name).join(", ")}`} />
      <ThreadLive threadId={id} />
      <Card className="space-y-3 p-4">
        <ol className="space-y-3" aria-live="polite">
          {data.messages.map((m) => {
            const mine = m.sender_id === ctx.user.id;
            const name = names.get(m.sender_id ?? "") ?? "Ancien participant";
            return (
              <li key={m.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <Avatar name={name} className="size-8" />
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted")}>
                  {!mine && <p className="mb-0.5 text-xs font-semibold">{name}</p>}
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className={cn("mt-1 text-[11px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{formatDateTime(m.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <ReplyForm threadId={id} />
      </Card>
    </div>
  );
}
