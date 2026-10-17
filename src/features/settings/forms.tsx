"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/form-status";
import type { ActionResult } from "@/server/errors";

type Action = (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;

/** Inline (non-dialog) form posting to a server action, with toast feedback. */
export function ActionForm({
  action,
  children,
  submitLabel = "Enregistrer",
  className,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Enregistré.");
    else toast.error(state.error);
  }, [state]);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="mt-4 flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
