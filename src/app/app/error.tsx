"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangleIcon}
      title="Une erreur est survenue"
      description={`Impossible d'afficher cette page pour le moment.${error.digest ? ` Référence : ${error.digest}` : ""}`}
      action={<Button onClick={reset}>Réessayer</Button>}
    />
  );
}
