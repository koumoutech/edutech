"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/server/errors";

type FormActionFn = (prev: unknown, fd: FormData) => Promise<unknown>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2Icon className="animate-spin" />} {label}
    </Button>
  );
}

/** Dialog containing a server-action form; field errors are shown via toast + per-field messages. */
export function FormDialog({
  title,
  action,
  children,
  trigger,
  triggerLabel = "Ajouter",
  triggerVariant = "default",
  submitLabel = "Enregistrer",
}: {
  title: string;
  action: FormActionFn;
  children: ReactNode | ((errors: Record<string, string[]>) => ReactNode);
  trigger?: ReactNode;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  async function formAction(fd: FormData) {
    const state = (await action(null, fd)) as ActionResult<unknown>;
    if (state.ok) {
      toast.success(state.message ?? "Enregistré.");
      setErrors({});
      setOpen(false);
    } else {
      toast.error(state.error);
      setErrors(state.fieldErrors ?? {});
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant={triggerVariant}>
            <PlusIcon /> {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">{typeof children === "function" ? children(errors) : children}</DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Submit label={submitLabel} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
