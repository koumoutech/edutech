import { CompassIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <EmptyState
        icon={CompassIcon}
        title="Page introuvable"
        description="La page demandée n'existe pas ou n'est plus disponible."
        action={
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        }
      />
    </main>
  );
}
