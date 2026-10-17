"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form-controls";
import type { ActionResult } from "@/server/errors";

/**
 * Generic confirmation dialog for sensitive operations. Optionally asks for a reason
 * (required by the audit trail for corrections, cancellations, archives...).
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "default",
  reason,
  action,
  children,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: ButtonProps["variant"];
  reason?: { label: string; minLength?: number; placeholder?: string };
  action: (reason: string, form: FormData) => Promise<ActionResult<unknown>>;
  children?: ReactNode;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await action(String(fd.get("reason") ?? ""), fd);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(res.message ?? "Opération effectuée.");
              setOpen(false);
              onDone?.();
              router.refresh();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {(children || reason) && (
            <DialogBody className="space-y-4">
              {children}
              {reason && (
                <Field label={reason.label} htmlFor="reason">
                  <Textarea
                    id="reason"
                    name="reason"
                    required
                    minLength={reason.minLength ?? 5}
                    placeholder={reason.placeholder}
                    rows={3}
                  />
                </Field>
              )}
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant={tone} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
