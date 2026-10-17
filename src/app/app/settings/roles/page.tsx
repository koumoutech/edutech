import type { Metadata } from "next";
import { FormDialog } from "@/components/inline-form";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Alert, PageHeader } from "@/components/ui/misc";
import { createRoleAction } from "@/features/settings/actions";
import { RolesMatrix } from "@/features/settings/roles-matrix";
import { canSchoolWide } from "@/lib/authz";
import { requirePermission } from "@/server/auth/session";
import { rolesMatrix } from "@/server/services/admin";

export const metadata: Metadata = { title: "Rôles & permissions" };

export default async function RolesPage() {
  const ctx = await requirePermission("users.read");
  const { roles, permissions, grants } = await rolesMatrix(ctx);
  const editable = canSchoolWide(ctx, "roles.manage");
  const map: Record<string, string> = {};
  for (const g of grants) map[`${g.role_id}|${g.permission_key}`] = g.scope;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Rôles & permissions"
        description="Chaque permission (consulter, créer, modifier, supprimer, valider, publier, exporter, administrer) est accordée avec une portée."
        actions={
          editable && (
            <FormDialog title="Nouveau rôle personnalisé" action={createRoleAction} triggerLabel="Nouveau rôle">
              <Field label="Nom" htmlFor="r-name">
                <Input id="r-name" name="name" required placeholder="Infirmier scolaire" />
              </Field>
              <Field label="Identifiant" htmlFor="r-key" hint="Minuscules, chiffres et _ (ex. infirmier)">
                <Input id="r-key" name="key" required pattern="[a-z0-9_]{2,48}" />
              </Field>
              <Field label="Description" htmlFor="r-desc">
                <Input id="r-desc" name="description" />
              </Field>
              <Field label="Copier les permissions de" htmlFor="r-copy">
                <Select id="r-copy" name="copy_from" defaultValue="">
                  <option value="">Aucun (rôle vide)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormDialog>
          )
        }
      />
      <Alert tone="info">
        Les permissions sont vérifiées par le serveur et par la base de données (Row Level Security). Masquer un bouton ne suffit jamais : retirer une permission ici
        retire réellement l&apos;accès aux données.
      </Alert>
      <Card>
        <CardContent className="pt-5">
          <RolesMatrix roles={roles} permissions={permissions} grants={map} editable={editable} />
        </CardContent>
      </Card>
    </div>
  );
}
