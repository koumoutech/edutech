"use client";

import { LogOutIcon } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/action-dialog";
import { SubmitButton } from "@/components/form-status";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { signOutEverywhere } from "@/features/auth/actions";
import { updateProfileAction } from "./profile-actions";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action] = useActionState(updateProfileAction, null);
  useEffect(() => {
    if (state) {
      if (state.ok) toast.success(state.message);
      else toast.error(state.error);
    }
  }, [state]);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nom complet" htmlFor="p-name">
        <Input id="p-name" name="full_name" defaultValue={fullName} required maxLength={160} />
      </Field>
      <Field label="Téléphone (SMS)" htmlFor="p-phone" hint="Format international, ex. +225 07 00 00 00 00">
        <Input id="p-phone" name="phone" type="tel" defaultValue={phone} maxLength={30} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

export function SignOutEverywhereButton() {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          <LogOutIcon /> Déconnecter tous mes appareils
        </Button>
      }
      title="Fermer toutes les sessions ?"
      description="Vous serez déconnecté(e) de tous les appareils, y compris celui-ci."
      tone="destructive"
      confirmLabel="Tout déconnecter"
      action={async () => {
        await signOutEverywhere();
        return { ok: true, data: null };
      }}
    />
  );
}
