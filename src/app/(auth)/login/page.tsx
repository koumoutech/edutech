import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/misc";
import { Alert } from "@/components/ui/misc";
import { LoginForm } from "@/features/auth/login-form";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Bon retour 👋</h1>
        <p className="text-muted-foreground text-sm">Connectez-vous à l&apos;espace de votre établissement.</p>
      </div>
      {!isSupabaseConfigured() && (
        <Alert tone="warning" title="Configuration requise">
          Les variables Supabase ne sont pas définies. Consultez documentation/installation.md.
        </Alert>
      )}
      <Suspense fallback={<Skeleton className="h-72" />}>
        <LoginForm />
      </Suspense>
      <p className="text-muted-foreground text-center text-xs">
        Pas encore de compte ? Les accès sont créés sur invitation de votre établissement.
      </p>
    </div>
  );
}
