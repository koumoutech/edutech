"use client";

import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import type { ActionResult } from "@/server/errors";

export function SubmitButton({ children, pendingLabel, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden />}
      {pending ? (pendingLabel ?? children) : children}
    </Button>
  );
}

export function ActionMessage({ state, success }: { state: ActionResult<unknown> | null; success?: ReactNode }) {
  if (!state) return null;
  if (!state.ok) return <Alert tone="danger">{state.error}</Alert>;
  if (state.message || success) return <Alert tone="success">{state.message ?? success}</Alert>;
  return null;
}

export function fieldError(state: ActionResult<unknown> | null, field: string): string | undefined {
  return state && !state.ok ? state.fieldErrors?.[field]?.[0] : undefined;
}
