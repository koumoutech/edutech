"use client";

import { CheckIcon, XIcon, BanknoteIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { setExpenseStatusAction } from "./actions";

export function ExpenseActions({ id, status }: { id: string; status: string }) {
  if (status === "pending") {
    return (
      <div className="flex justify-end gap-1">
        <ConfirmDialog
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Approuver">
              <CheckIcon />
            </Button>
          }
          title="Approuver la dépense ?"
          action={() => setExpenseStatusAction(id, "approved")}
        />
        <ConfirmDialog
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Rejeter">
              <XIcon />
            </Button>
          }
          title="Rejeter la dépense ?"
          tone="destructive"
          action={() => setExpenseStatusAction(id, "rejected")}
        />
      </div>
    );
  }
  if (status === "approved") {
    return (
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost">
            <BanknoteIcon /> Payée
          </Button>
        }
        title="Marquer comme payée ?"
        action={() => setExpenseStatusAction(id, "paid")}
      />
    );
  }
  return null;
}
