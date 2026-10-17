import type { Metadata } from "next";
import { Alert } from "@/components/ui/misc";
import { SetupForm } from "@/features/auth/password-forms";

export const metadata: Metadata = { title: "Initialisation", robots: { index: false } };

export default function SetupPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Initialisation de la plateforme</h1>
        <p className="text-muted-foreground text-sm">
          Création du premier superadministrateur. Cette procédure ne fonctionne qu&apos;une seule fois et exige le
          jeton secret défini côté serveur.
        </p>
      </div>
      <Alert tone="warning">Supprimez la variable SETUP_TOKEN après l&apos;initialisation.</Alert>
      <SetupForm />
    </div>
  );
}
