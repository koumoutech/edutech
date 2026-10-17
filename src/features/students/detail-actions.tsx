"use client";

import { ArchiveIcon, ArrowRightLeftIcon, LogOutIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { RELATIONSHIP_LABELS } from "@/schemas/students";
import {
  addGuardianAction,
  archiveStudentAction,
  enrollStudentAction,
  unlinkGuardianAction,
  withdrawStudentAction,
} from "./actions";

export function EnrollButton({
  studentId,
  classes,
  currentClassId,
}: {
  studentId: string;
  classes: { id: string; name: string }[];
  currentClassId: string | null;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <ArrowRightLeftIcon /> {currentClassId ? "Changer de classe" : "Affecter à une classe"}
        </Button>
      }
      title={currentClassId ? "Changer de classe" : "Affecter à une classe"}
      description="L'historique d'inscription est conservé. La capacité de la classe est vérifiée."
      confirmLabel="Enregistrer"
      action={(_r, fd) => enrollStudentAction(studentId, String(fd.get("class_id")))}
    >
      <Field label="Classe" htmlFor="class_id">
        <Select id="class_id" name="class_id" required defaultValue="">
          <option value="" disabled>
            Choisir…
          </option>
          {classes
            .filter((c) => c.id !== currentClassId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </Field>
    </ConfirmDialog>
  );
}

export function WithdrawButton({ studentId }: { studentId: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <LogOutIcon /> Départ / transfert
        </Button>
      }
      title="Enregistrer un départ"
      description="L'inscription active est clôturée. Le dossier reste consultable."
      confirmLabel="Enregistrer le départ"
      reason={{ label: "Motif / établissement d'accueil", minLength: 3 }}
      action={(reason, fd) => withdrawStudentAction(studentId, String(fd.get("status")), reason)}
    >
      <Field label="Type de départ" htmlFor="status">
        <Select id="status" name="status" defaultValue="transferred">
          <option value="transferred">Transfert vers un autre établissement</option>
          <option value="withdrawn">Départ / abandon</option>
          <option value="graduated">Fin de cursus</option>
        </Select>
      </Field>
    </ConfirmDialog>
  );
}

export function ArchiveButton({ studentId }: { studentId: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive">
          <ArchiveIcon /> Archiver
        </Button>
      }
      title="Archiver le dossier"
      description="Suppression logique : le dossier n'apparaît plus dans les listes actives mais reste conservé conformément à la politique de conservation."
      confirmLabel="Archiver"
      tone="destructive"
      reason={{ label: "Motif de l'archivage" }}
      action={(reason) => archiveStudentAction(studentId, reason)}
    />
  );
}

export function AddGuardianButton({ studentId }: { studentId: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <UserPlusIcon /> Ajouter un responsable
        </Button>
      }
      title="Ajouter un responsable"
      confirmLabel="Ajouter"
      action={(_r, fd) =>
        addGuardianAction(studentId, {
          first_name: fd.get("first_name"),
          last_name: fd.get("last_name"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          relationship: fd.get("relationship"),
          is_emergency_contact: fd.get("is_emergency_contact") === "on",
          is_billing_contact: fd.get("is_billing_contact") === "on",
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom" htmlFor="g-first" required>
          <Input id="g-first" name="first_name" required />
        </Field>
        <Field label="Nom" htmlFor="g-last" required>
          <Input id="g-last" name="last_name" required />
        </Field>
        <Field label="Lien" htmlFor="g-rel">
          <Select id="g-rel" name="relationship" defaultValue="tutor">
            {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Téléphone" htmlFor="g-phone">
          <Input id="g-phone" name="phone" type="tel" />
        </Field>
        <Field label="E-mail" htmlFor="g-email" className="sm:col-span-2">
          <Input id="g-email" name="email" type="email" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_emergency_contact" className="size-4 accent-[var(--primary)]" /> Contact
          d&apos;urgence
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_billing_contact" className="size-4 accent-[var(--primary)]" /> Facturation
        </label>
      </div>
    </ConfirmDialog>
  );
}

export function UnlinkGuardianButton({
  studentId,
  guardianId,
  name,
}: {
  studentId: string;
  guardianId: string;
  name: string;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${name}`}>
          <Trash2Icon />
        </Button>
      }
      title={`Retirer ${name} ?`}
      description="Le responsable n'aura plus accès aux informations de cet élève."
      tone="destructive"
      confirmLabel="Retirer"
      action={() => unlinkGuardianAction(studentId, guardianId)}
    />
  );
}
