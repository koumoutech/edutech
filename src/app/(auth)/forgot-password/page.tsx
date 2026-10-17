import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/auth/password-forms";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">Indiquez votre adresse e-mail : nous vous enverrons un lien sécurisé.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="block text-center text-sm font-medium text-primary hover:underline">
        Retour à la connexion
      </Link>
    </div>
  );
}
