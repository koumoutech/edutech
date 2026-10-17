import type { Metadata } from "next";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { saveFeeScheduleAction, saveSimpleAction } from "@/features/finance/actions";
import { FEE_CATEGORIES, METHOD_KINDS } from "@/features/finance/labels";
import { canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { financeSettings } from "@/server/services/finance";

export const metadata: Metadata = { title: "Frais & paramètres financiers" };

export default async function FinanceSettingsPage() {
  const ctx = await requirePermission("finance.read", ["school"]);
  const s = await financeSettings(ctx);
  const manage = canSchoolWide(ctx, "finance.manage");
  const cur = ctx.school.currency;
  const current = s.years.find((y) => y.is_current) ?? s.years[0];

  return (
    <div className="space-y-5">
      <PageHeader title="Frais & paramètres financiers" description={`Devise : ${cur}. Barème des frais par niveau, réductions, bourses et modes de paiement.`} />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Frais scolaires {current ? `— ${current.name}` : ""}</CardTitle>
          {manage && current && (
            <FormDialog title="Nouveau frais" action={saveFeeScheduleAction} triggerLabel="Ajouter un frais">
              <input type="hidden" name="academic_year_id" value={current.id} />
              <Field label="Type de frais" htmlFor="fs-type">
                <Select id="fs-type" name="fee_type_id" required>
                  {s.feeTypes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Niveau" htmlFor="fs-level">
                  <Select id="fs-level" name="level_id" defaultValue="">
                    <option value="">Tous les niveaux</option>
                    {s.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Montant (${cur})`} htmlFor="fs-amount">
                  <Input id="fs-amount" name="amount" type="number" min={0} step="any" required />
                </Field>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Échéancier (facultatif, total 100 %)</legend>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <Input name="due_on" type="date" aria-label={`Échéance ${i + 1}`} />
                    <Input name="percent" type="number" min={1} max={100} step="any" placeholder="%" aria-label={`Pourcentage ${i + 1}`} />
                  </div>
                ))}
              </fieldset>
            </FormDialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Frais</TH>
                <TH>Niveau</TH>
                <TH className="text-right">Montant</TH>
                <TH className="hidden sm:table-cell">Échéancier</TH>
              </TR>
            </THead>
            <TBody>
              {s.schedules
                .filter((x) => x.academic_year_id === current?.id)
                .sort((a, b) => (a.level?.position ?? 0) - (b.level?.position ?? 0))
                .map((x) => (
                  <TR key={x.id}>
                    <TD className="font-medium">{x.fee_type?.name}</TD>
                    <TD>{x.level?.name ?? "Tous"}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(Number(x.amount), cur)}</TD>
                    <TD className="hidden text-xs text-muted-foreground sm:table-cell">
                      {Array.isArray(x.installments) && x.installments.length
                        ? (x.installments as { due_on: string; percent: number }[]).map((i) => `${formatDate(i.due_on)} : ${i.percent} %`).join(" · ")
                        : "Paiement unique"}
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Réductions & bourses</CardTitle>
            {manage && (
              <FormDialog title="Nouvelle réduction" action={saveSimpleAction.bind(null, "discounts")} triggerLabel="Ajouter">
                <Field label="Nom" htmlFor="d-name">
                  <Input id="d-name" name="name" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type" htmlFor="d-kind">
                    <Select id="d-kind" name="kind">
                      <option value="percent">Pourcentage</option>
                      <option value="fixed">Montant fixe</option>
                    </Select>
                  </Field>
                  <Field label="Valeur" htmlFor="d-value">
                    <Input id="d-value" name="value" type="number" min={0} step="any" required />
                  </Field>
                </div>
                <Field label="S'applique à" htmlFor="d-cat">
                  <Select id="d-cat" name="applies_to_category" defaultValue="">
                    <option value="">Tous les frais</option>
                    {Object.entries(FEE_CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_scholarship" className="size-4 accent-[var(--primary)]" /> Bourse
                </label>
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {s.discounts.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <span>
                    {d.name} {d.is_scholarship && <Badge variant="warning">Bourse</Badge>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {d.kind === "percent" ? `${d.value} %` : formatMoney(Number(d.value), cur)} · {d.applies_to_category ? FEE_CATEGORIES[d.applies_to_category] : "tous frais"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Modes de paiement</CardTitle>
            {manage && (
              <FormDialog title="Nouveau mode de paiement" action={saveSimpleAction.bind(null, "payment_methods")} triggerLabel="Ajouter">
                <Field label="Nom" htmlFor="m-name">
                  <Input id="m-name" name="name" required placeholder="Orange Money, Wave, MTN MoMo…" />
                </Field>
                <Field label="Type" htmlFor="m-kind">
                  <Select id="m-kind" name="kind">
                    {Object.entries(METHOD_KINDS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="requires_reference" defaultChecked className="size-4 accent-[var(--primary)]" /> Référence de transaction obligatoire
                </label>
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {s.methods.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>{m.name}</span>
                  <span className="text-muted-foreground">
                    {METHOD_KINDS[m.kind]}
                    {m.requires_reference ? " · référence requise" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Types de frais</CardTitle>
            {manage && (
              <FormDialog title="Nouveau type de frais" action={saveSimpleAction.bind(null, "fee_types")} triggerLabel="Ajouter">
                <Field label="Nom" htmlFor="ft-name">
                  <Input id="ft-name" name="name" required />
                </Field>
                <Field label="Catégorie" htmlFor="ft-cat">
                  <Select id="ft-cat" name="category">
                    {Object.entries(FEE_CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {s.feeTypes.map((f) => (
                <li key={f.id}>
                  <Badge variant="outline">
                    {f.name} · {FEE_CATEGORIES[f.category]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Fournisseurs & catégories de dépenses</CardTitle>
            <div className="flex gap-2">
              {canSchoolWide(ctx, "expenses.create") && (
                <FormDialog title="Nouveau fournisseur" action={saveSimpleAction.bind(null, "suppliers")} triggerLabel="Fournisseur" triggerVariant="outline">
                  <Field label="Nom" htmlFor="sp-name">
                    <Input id="sp-name" name="name" required />
                  </Field>
                  <Field label="Contact" htmlFor="sp-contact">
                    <Input id="sp-contact" name="contact_name" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Téléphone" htmlFor="sp-phone">
                      <Input id="sp-phone" name="phone" type="tel" />
                    </Field>
                    <Field label="E-mail" htmlFor="sp-email">
                      <Input id="sp-email" name="email" type="email" />
                    </Field>
                  </div>
                </FormDialog>
              )}
              {manage && (
                <FormDialog title="Nouvelle catégorie" action={saveSimpleAction.bind(null, "expense_categories")} triggerLabel="Catégorie" triggerVariant="outline">
                  <Field label="Nom" htmlFor="ec-name">
                    <Input id="ec-name" name="name" required />
                  </Field>
                </FormDialog>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {s.categories.map((c) => (
                <Badge key={c.id} variant="muted">
                  {c.name}
                </Badge>
              ))}
            </div>
            <ul className="divide-y">
              {s.suppliers.map((sp) => (
                <li key={sp.id} className="flex justify-between py-2">
                  <span>{sp.name}</span>
                  <span className="text-muted-foreground">{sp.phone ?? sp.email ?? ""}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
