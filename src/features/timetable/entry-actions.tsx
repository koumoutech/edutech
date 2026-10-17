"use client";

import { PrinterIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { deleteEntryAction } from "./actions";

export function DeleteEntryButton({ id }: { id: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Supprimer le créneau" className="opacity-60 hover:opacity-100">
          <Trash2Icon />
        </Button>
      }
      title="Supprimer ce créneau ?"
      tone="destructive"
      confirmLabel="Supprimer"
      action={() => deleteEntryAction(id)}
    />
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <PrinterIcon /> Imprimer
    </Button>
  );
}
