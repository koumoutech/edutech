"use client";

import { CheckCircle2Icon, EyeIcon, EyeOffIcon, PencilIcon, SendIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { correctGradeAction, deleteAssessmentAction, setAssessmentStatusAction } from "./actions";

export function AssessmentWorkflow({
  id,
  status,
  canSubmit,
  canValidate,
  canPublish,
  canUnpublish,
  canDelete,
}: {
  id: string;
  status: string;
  canSubmit: boolean;
  canValidate: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {canSubmit && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline">
              <SendIcon /> Soumettre pour validation
            </Button>
          }
          title="Soumettre les notes ?"
          description="La direction des études sera invitée à valider l'évaluation."
          action={() => setAssessmentStatusAction(id, "submitted")}
        />
      )}
      {canValidate && (
        <ConfirmDialog
          trigger={
            <Button size="sm">
              <CheckCircle2Icon /> Valider
            </Button>
          }
          title="Valider l'évaluation ?"
          description="Les notes seront verrouillées. Toute modification ultérieure passera par la procédure de correction tracée."
          action={() => setAssessmentStatusAction(id, "validated")}
        />
      )}
      {status === "submitted" && canValidate && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost">
              <Undo2Icon /> Renvoyer à l&apos;enseignant
            </Button>
          }
          title="Renvoyer en brouillon ?"
          action={() => setAssessmentStatusAction(id, "draft")}
        />
      )}
      {canPublish && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="highlight">
              <EyeIcon /> Publier aux familles
            </Button>
          }
          title="Publier les résultats ?"
          description="Les élèves et leurs parents verront les notes et recevront une notification."
          action={() => setAssessmentStatusAction(id, "published")}
        />
      )}
      {canUnpublish && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline">
              <EyeOffIcon /> Retirer la publication
            </Button>
          }
          title="Retirer la publication ?"
          description="Les familles ne verront plus ces notes jusqu'à une nouvelle publication."
          action={() => setAssessmentStatusAction(id, "validated")}
        />
      )}
      {canDelete && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" className="text-destructive">
              <Trash2Icon /> Supprimer
            </Button>
          }
          title="Supprimer l'évaluation ?"
          description="Les notes saisies seront supprimées. Action réservée aux brouillons."
          tone="destructive"
          confirmLabel="Supprimer"
          action={() => deleteAssessmentAction(id)}
          onDone={() => router.push("/app/assessments")}
        />
      )}
    </div>
  );
}

export function CorrectGradeButton({ gradeId, studentName, score, isAbsent, maxScore }: { gradeId: string; studentName: string; score: number | null; isAbsent: boolean; maxScore: number }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Corriger la note de ${studentName}`}>
          <PencilIcon />
        </Button>
      }
      title={`Corriger la note — ${studentName}`}
      description="Correction d'une note validée : l'ancienne et la nouvelle valeur, l'auteur et le motif sont enregistrés."
      confirmLabel="Enregistrer la correction"
      reason={{ label: "Motif de la correction", placeholder: "Erreur de report, copie recorrigée…" }}
      action={(reason, fd) => correctGradeAction(gradeId, reason, fd)}
    >
      <div className="flex items-end gap-3">
        <Field label={`Nouvelle note (/${maxScore})`} htmlFor="score">
          <Input id="score" name="score" type="number" step="0.25" min={0} max={maxScore} defaultValue={score ?? ""} className="w-28" />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="is_absent" defaultChecked={isAbsent} className="size-4 accent-[var(--primary)]" /> Absent
        </label>
      </div>
    </ConfirmDialog>
  );
}
