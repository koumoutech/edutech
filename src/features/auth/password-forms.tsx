"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { ActionMessage, fieldError, SubmitButton } from "@/components/form-status";
import { Field, Input } from "@/components/ui/form-controls";
import { bootstrapPlatform, requestPasswordReset, setPassword } from "./actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4">
      <ActionMessage state={state} />
      <Field label="Adresse e-mail" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Envoi…">
        Recevoir un lien de réinitialisation
      </SubmitButton>
    </form>
  );
}

export function SetPasswordForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(setPassword, null);
  return (
    <form action={action} className="space-y-4">
      <ActionMessage state={state} />
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <Field label="Nouveau mot de passe" htmlFor="password" error={fieldError(state, "password")} hint="10 caractères minimum, avec des lettres et des chiffres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirmation" htmlFor="confirm" error={fieldError(state, "confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Enregistrement…">
        Enregistrer le mot de passe
      </SubmitButton>
    </form>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(bootstrapPlatform, null);
  return (
    <form action={action} className="space-y-4">
      <ActionMessage state={state} />
      <Field label="Jeton d'initialisation (SETUP_TOKEN)" htmlFor="token" error={fieldError(state, "token")}>
        <Input id="token" name="token" type="password" autoComplete="off" required />
      </Field>
      <Field label="Nom complet" htmlFor="fullName" error={fieldError(state, "fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>
      <Field label="Adresse e-mail" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" htmlFor="password" error={fieldError(state, "password")} hint="10 caractères minimum, avec des lettres et des chiffres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel="Initialisation…">
        Créer le superadministrateur
      </SubmitButton>
    </form>
  );
}
