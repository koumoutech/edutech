import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { Skeleton } from "@/components/ui/misc";
import { SetPasswordForm } from "@/features/auth/password-forms";

export const metadata: Metadata = { title: "Définir un mot de passe", robots: { index: false } };

export default function SetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo name="EduDigi" />
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Définissez votre mot de passe</h1>
        <p className="text-muted-foreground text-sm">Il protège l&apos;accès aux données de votre établissement.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-56" />}>
        <SetPasswordForm />
      </Suspense>
    </main>
  );
}
