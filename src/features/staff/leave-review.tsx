"use client";

import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form-controls";
import { cancelLeaveAction, reviewLeaveAction } from "./actions";

export function LeaveReview({ id, staff, teachers }: { id: string; staff: string; teachers: { id: string; name: string }[] }) {
  return (
    <div className="flex gap-2">
      <ConfirmDialog
        trigger={<Button size="sm">Approuver</Button>}
        title={`Approuver la demande de ${staff}`}
        confirmLabel="Approuver"
        action={(_r, fd) => reviewLeaveAction(id, "approved", "", fd)}
      >
        <Field label="Remplaçant (facultatif)" htmlFor={`sub-${id}`}>
          <Select id={`sub-${id}`} name="substitute_staff_id" defaultValue="">
            <option value="">Aucun</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="outline">
            Refuser
          </Button>
        }
        title={`Refuser la demande de ${staff}`}
        tone="destructive"
        confirmLabel="Refuser"
        reason={{ label: "Motif (communiqué à la personne)", minLength: 3 }}
        action={(reason, fd) => reviewLeaveAction(id, "rejected", reason, fd)}
      />
    </div>
  );
}

export function CancelLeaveButton({ id }: { id: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost">
          Annuler
        </Button>
      }
      title="Annuler cette demande ?"
      action={() => cancelLeaveAction(id)}
    />
  );
}
