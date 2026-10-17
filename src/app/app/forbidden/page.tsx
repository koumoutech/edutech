import { ShieldOffIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function ForbiddenPage() {
  return (
    <EmptyState
      icon={ShieldOffIcon}
      title="Accès non autorisé"
      description="Votre rôle ne permet pas d'accéder à cette page. Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur de votre établissement."
      action={
        <Button asChild>
          <Link href="/app">Retour au tableau de bord</Link>
        </Button>
      }
    />
  );
}
