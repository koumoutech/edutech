import { SchoolIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { signOut } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Aucun établissement" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <EmptyState
        icon={SchoolIcon}
        title="Aucun établissement associé à ce compte"
        description="Votre compte est actif mais n'est rattaché à aucun établissement, ou votre accès a été suspendu. Contactez l'administration de votre établissement pour recevoir une invitation."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/platform">Espace plateforme</Link>
            </Button>
            <form action={signOut}>
              <Button type="submit">Se déconnecter</Button>
            </form>
          </div>
        }
      />
    </main>
  );
}
