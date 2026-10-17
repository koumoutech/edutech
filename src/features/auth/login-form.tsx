"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { ActionMessage, fieldError, SubmitButton } from "@/components/form-status";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/misc";
import { signIn } from "./actions";

export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState(signIn, null);
  const [show, setShow] = useState(false);
  const emailError = fieldError(state, "email");

  return (
    <form action={action} className="space-y-4" noValidate>
      {params.get("setup") && <Alert tone="success">Plateforme initialisée. Connectez-vous avec le compte créé.</Alert>}
      {params.get("revoked") && <Alert tone="success">Toutes vos sessions ont été fermées.</Alert>}
      {params.get("error") && <Alert tone="danger">Le lien utilisé est invalide ou a expiré.</Alert>}
      <ActionMessage state={state} />
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <Field label="Adresse e-mail" htmlFor="email" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "email-error" : undefined}
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center"
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-primary text-sm font-medium hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
    </form>
  );
}
