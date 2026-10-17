"use client";

import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { updateRequestAction } from "./actions";

export function RequestActions({
  id,
  status,
  manage,
  mine,
}: {
  id: string;
  status: string;
  manage: boolean;
  mine: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {manage && status === "open" && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline">
              Prendre en charge
            </Button>
          }
          title="Prendre en charge la demande ?"
          action={() => updateRequestAction(id, "in_progress", "")}
        />
      )}
      {manage && ["open", "in_progress"].includes(status) && (
        <>
          <ConfirmDialog
            trigger={<Button size="sm">Clôturer</Button>}
            title="Clôturer la demande"
            confirmLabel="Clôturer"
            reason={{ label: "Réponse au demandeur", minLength: 3 }}
            action={(reason) => updateRequestAction(id, "done", reason)}
          />
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="ghost">
                Refuser
              </Button>
            }
            title="Refuser la demande"
            tone="destructive"
            reason={{ label: "Motif", minLength: 3 }}
            action={(reason) => updateRequestAction(id, "rejected", reason)}
          />
        </>
      )}
      {mine && status === "open" && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost">
              Annuler
            </Button>
          }
          title="Annuler votre demande ?"
          action={() => updateRequestAction(id, "cancelled", "")}
        />
      )}
    </div>
  );
}
