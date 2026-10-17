import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { signOut } from "@/features/auth/actions";
import { MfaChallengeForm } from "@/features/auth/mfa-forms";
import { safeNextPath } from "@/server/auth/security";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Double authentification", robots: { index: false } };

export default function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo name="EduDigi" />
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">Double authentification</h1>
        <p className="text-muted-foreground text-sm">
          Saisissez le code à 6 chiffres affiché par votre application d&apos;authentification.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Challenge searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Challenge({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [user, { next: raw }] = await Promise.all([getSessionUser(), searchParams]);
  const next = safeNextPath(raw);
  if (!user) redirect("/login");
  if (!user.mfaPending) redirect(next);
  return (
    <div className="space-y-4">
      <MfaChallengeForm next={next} />
      <form action={signOut}>
        <Button type="submit" variant="link" className="w-full">
          Se déconnecter
        </Button>
      </form>
    </div>
  );
}
