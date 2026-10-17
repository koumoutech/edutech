import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { AcceptInvitation } from "@/features/settings/accept-invitation";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default function InvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo name="EduDigi" />
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ token }, sp, user] = await Promise.all([params, searchParams, getSessionUser()]);
  const next = `/invitation/${encodeURIComponent(token)}`;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Rejoindre votre établissement</h1>
      {user ? (
        <>
          <p className="text-muted-foreground text-sm">
            Vous êtes connecté(e) en tant que <strong>{user.email}</strong>. L&apos;invitation ne peut être acceptée
            qu&apos;avec l&apos;adresse à laquelle elle a été envoyée.
          </p>
          <AcceptInvitation token={token} isNew={sp.new === "1"} />
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Connectez-vous avec l&apos;adresse e-mail invitée pour accepter l&apos;invitation.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Se connecter</Link>
          </Button>
          <p className="text-muted-foreground text-xs">
            Nouveau compte ? Utilisez le lien reçu par e-mail pour définir votre mot de passe.
          </p>
        </>
      )}
    </div>
  );
}
