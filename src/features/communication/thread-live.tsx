"use client";

import { SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/form-status";
import { Textarea } from "@/components/ui/form-controls";
import { getBrowserClient } from "@/lib/supabase/browser";
import { replyAction } from "./actions";

/** Refreshes the thread when a new message arrives (Realtime, RLS-filtered). */
export function ThreadLive({ threadId }: { threadId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` }, () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, router]);
  return null;
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        const res = await replyAction(threadId, null, fd);
        if (!res.ok) toast.error(res.error);
        else ref.current?.reset();
      }}
      className="flex items-end gap-2"
    >
      <label className="flex-1">
        <span className="sr-only">Votre message</span>
        <Textarea name="body" required maxLength={5000} rows={2} placeholder="Écrire une réponse…" />
      </label>
      <SubmitButton size="icon" aria-label="Envoyer">
        <SendIcon />
      </SubmitButton>
    </form>
  );
}
