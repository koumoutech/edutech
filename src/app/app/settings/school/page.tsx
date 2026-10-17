import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/misc";
import { updateGradingPolicyAction, updateSchoolAction } from "@/features/settings/actions";
import { ActionForm } from "@/features/settings/forms";
import { can } from "@/lib/authz";
import { publicEnv } from "@/lib/env";
import { requireContext } from "@/server/auth/session";
import { getGradingPolicy, getSchool } from "@/server/services/admin";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Établissement" };

export default async function SchoolSettingsPage() {
  const ctx = await requireContext();
  const manageSchool = can(ctx, "school.manage", ["school"]);
  const manageGrading = can(ctx, "academics.manage", ["school"]);
  if (!manageSchool && !manageGrading) redirect("/app/forbidden");
  const [s, policy] = await Promise.all([getSchool(ctx), getGradingPolicy(ctx)]);
  const logoUrl = s.logo_path && publicEnv.NEXT_PUBLIC_SUPABASE_URL ? `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/school-assets/${s.logo_path}` : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Établissement" description="Identité, coordonnées et règles de notation." />
      {manageSchool && (
        <Card>
          <CardHeader>
            <CardTitle>Identité et coordonnées</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateSchoolAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom de l'établissement" htmlFor="s-name" className="sm:col-span-2">
                <Input id="s-name" name="name" defaultValue={s.name} required />
              </Field>
              <Field label="Nom court" htmlFor="s-short">
                <Input id="s-short" name="short_name" defaultValue={s.short_name ?? ""} />
              </Field>
              <Field label="Type" htmlFor="s-type">
                <Select id="s-type" name="school_type" defaultValue={s.school_type}>
                  <option value="preschool">Maternelle</option>
                  <option value="primary">Primaire</option>
                  <option value="middle">Collège</option>
                  <option value="high">Lycée</option>
                  <option value="secondary">Secondaire</option>
                  <option value="mixed">Groupe scolaire</option>
                </Select>
              </Field>
              <Field label="Statut" htmlFor="s-sector">
                <Select id="s-sector" name="sector" defaultValue={s.sector}>
                  <option value="private">Privé</option>
                  <option value="public">Public</option>
                </Select>
              </Field>
              <Field label="Pays (code ISO)" htmlFor="s-country">
                <Input id="s-country" name="country" defaultValue={s.country} maxLength={2} required />
              </Field>
              <Field label="Adresse" htmlFor="s-address" className="sm:col-span-2">
                <Input id="s-address" name="address" defaultValue={s.address ?? ""} />
              </Field>
              <Field label="Ville" htmlFor="s-city">
                <Input id="s-city" name="city" defaultValue={s.city ?? ""} />
              </Field>
              <Field label="Téléphone" htmlFor="s-phone">
                <Input id="s-phone" name="phone" defaultValue={s.phone ?? ""} />
              </Field>
              <Field label="E-mail" htmlFor="s-email">
                <Input id="s-email" name="email" type="email" defaultValue={s.email ?? ""} />
              </Field>
              <Field label="Site web" htmlFor="s-web">
                <Input id="s-web" name="website" type="url" defaultValue={s.website ?? ""} />
              </Field>
              <Field label="Devise (ISO 4217)" htmlFor="s-cur" hint="XOF, XAF, EUR, MAD…">
                <Input id="s-cur" name="currency" defaultValue={s.currency} maxLength={3} required />
              </Field>
              <Field label="Fuseau horaire" htmlFor="s-tz">
                <Input id="s-tz" name="timezone" defaultValue={s.timezone} required />
              </Field>
              <Field label="Couleur principale" htmlFor="s-color">
                <Input id="s-color" name="brand_color" type="color" defaultValue={s.brand_color ?? "#16834A"} className="h-10 w-20 p-1" />
              </Field>
              <Field label="Logo (PNG, JPEG, WEBP — 2 Mo)" htmlFor="s-logo">
                <div className="flex items-center gap-3">
                  {logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo actuel" className="size-10 rounded-lg border object-contain" />
                  )}
                  <Input id="s-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="pt-1.5" />
                </div>
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {manageGrading && policy && (
        <Card>
          <CardHeader>
            <CardTitle>Barème de notation par défaut</CardTitle>
            <CardDescription>Utilisé pour le calcul des moyennes, rangs et mentions des bulletins (un barème par niveau peut être défini).</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateGradingPolicyAction} className="grid gap-3 sm:grid-cols-3">
              <Field label="Système éducatif" htmlFor="g-sys">
                <Input id="g-sys" name="education_system" defaultValue={policy.education_system} />
              </Field>
              <Field label="Note maximale" htmlFor="g-max">
                <Input id="g-max" name="scale_max" type="number" step="any" defaultValue={Number(policy.scale_max)} />
              </Field>
              <Field label="Seuil de réussite" htmlFor="g-pass">
                <Input id="g-pass" name="passing_mark" type="number" step="any" defaultValue={Number(policy.passing_mark)} />
              </Field>
              <Field label="Décimales" htmlFor="g-dec">
                <Input id="g-dec" name="decimals" type="number" min={0} max={4} defaultValue={policy.decimals} />
              </Field>
              <Field label="Arrondi" htmlFor="g-round">
                <Select id="g-round" name="rounding" defaultValue={policy.rounding}>
                  <option value="half_up">Au plus proche</option>
                  <option value="down">Inférieur</option>
                  <option value="up">Supérieur</option>
                </Select>
              </Field>
              <Field label="Absence non justifiée" htmlFor="g-miss">
                <Select id="g-miss" name="missing_policy" defaultValue={policy.missing_policy}>
                  <option value="exclude">Non comptée</option>
                  <option value="zero">Comptée 0</option>
                </Select>
              </Field>
              <Field label="Absence justifiée" htmlFor="g-exc">
                <Select id="g-exc" name="excused_policy" defaultValue={policy.excused_policy}>
                  <option value="exclude">Non comptée</option>
                  <option value="zero">Comptée 0</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="ranking_enabled" defaultChecked={policy.ranking_enabled} className="size-4 accent-[var(--primary)]" /> Classements
              </label>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
