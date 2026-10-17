"use client";

import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/action-dialog";
import { deleteClassSubjectAction } from "./actions";

/** Remove a teaching assignment (blocked server-side when assessments exist). */
export function ConfirmDialogServerSafe({ classSubjectId, label, trigger }: { classSubjectId: string; label: string; trigger: ReactNode }) {
  return (
    <ConfirmDialog
      trigger={trigger}
      title={`Retirer ${label} ?`}
      description="L'enseignement est retiré de la classe. Impossible s'il existe déjà des évaluations."
      tone="destructive"
      confirmLabel="Retirer"
      action={() => deleteClassSubjectAction(classSubjectId)}
    />
  );
}
