import { ShieldIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createSchoolAction, updateBrandingAction } from "@/features/platform/actions";
import { ActionForm } from "@/features/settings/forms";
import { formatDate } from "@/lib/utils";
import { getSessionUser } from "@/server/auth/session";
import { getBranding } from "@/server/platform";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Administration de la plateforme", robots: { index: false } };

export default function PlatformPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Logo name="EduDigi" />
        <Button asChild variant="outline" size="sm">
          <Link href="/app">Espace établissement</Link>
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mfaPending) redirect("/auth/mfa?next=/platform");
  const db = await createClient();
  const { data: admin } = await db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/no-access");
  const [{ data: schools }, branding] = await Promise.all([
    db
      .from("schools")
      .select("id, name, slug, country, currency, status, is_demo, created_at")
      .order("created_at", { ascending: false }),
    getBranding(),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Superadministrateur"
        title="Plateforme"
        description="Gestion des établissements (tenants) et de l'identité du produit. Aucun accès aux données scolaires sans appartenance à un établissement."
        actions={
          <FormDialog title="Nouvel établissement" action={createSchoolAction} triggerLabel="Nouvel établissement">
            <Field label="Nom" htmlFor="sc-name">
              <Input id="sc-name" name="name" required />
            </Field>
            <Field label="Identifiant (URL)" htmlFor="sc-slug">
              <Input id="sc-slug" name="slug" required pattern="[a-z0-9-]{3,48}" placeholder="lycee-moderne-abidjan" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Pays" htmlFor="sc-country">
                <Input id="sc-country" name="country" defaultValue="CI" maxLength={2} required />
              </Field>
              <Field label="Devise" htmlFor="sc-cur">
                <Input id="sc-cur" name="currency" defaultValue="XOF" maxLength={3} required />
              </Field>
              <Field label="Fuseau" htmlFor="sc-tz">
                <Input id="sc-tz" name="timezone" defaultValue="Africa/Abidjan" required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_demo" className="size-4 accent-[var(--primary)]" /> Établissement de
              démonstration (isolé)
            </label>
          </FormDialog>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Établissements</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Nom</TH>
                <TH>Identifiant</TH>
                <TH>Pays / devise</TH>
                <TH>Créé le</TH>
                <TH>Statut</TH>
              </TR>
            </THead>
            <TBody>
              {(schools ?? []).map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">
                    {s.name} {s.is_demo && <Badge variant="warning">Démo</Badge>}
                  </TD>
                  <TD className="font-mono text-xs">{s.slug}</TD>
                  <TD>
                    {s.country} · {s.currency}
                  </TD>
                  <TD>{formatDate(s.created_at)}</TD>
                  <TD>
                    <Badge variant={s.status === "active" ? "default" : "muted"}>{s.status}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldIcon className="size-4" aria-hidden /> Identité du produit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateBrandingAction} className="grid gap-3 sm:grid-cols-3">
            <Field label="Nom du produit" htmlFor="b-name">
              <Input id="b-name" name="name" defaultValue={branding.productName} required maxLength={40} />
            </Field>
            <Field label="Accroche" htmlFor="b-tag">
              <Input id="b-tag" name="tagline" defaultValue={branding.tagline} required />
            </Field>
            <Field label="E-mail de support" htmlFor="b-mail">
              <Input id="b-mail" name="support_email" type="email" defaultValue={branding.supportEmail} required />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
