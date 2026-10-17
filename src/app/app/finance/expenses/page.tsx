import { ReceiptIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { createExpenseAction, saveBudgetAction } from "@/features/finance/actions";
import { ExpenseActions } from "@/features/finance/expense-actions";
import { EXPENSE_STATUS } from "@/features/finance/labels";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, isoDate } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { getCurrentYear } from "@/server/repositories/academic";
import { financeSettings, listExpenses } from "@/server/services/finance";

export const metadata: Metadata = { title: "Dépenses & budgets" };

export default async function ExpensesPage() {
  const ctx = await requireContext();
  if (!can(ctx, "expenses.read") && !can(ctx, "budgets.manage")) redirect("/app/forbidden");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const [expenses, settings, budget] = await Promise.all([
    can(ctx, "expenses.read") ? listExpenses(ctx) : [],
    financeSettings(ctx).catch(() => null),
    year ? ctx.db.rpc("stats_expenses_by_category", { p_school: ctx.school.id, p_year: year.id }) : null,
  ]);
  const cur = ctx.school.currency;
  const canValidate = canSchoolWide(ctx, "expenses.validate");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dépenses & budgets"
        description="Saisie, approbation (séparation des tâches) et suivi budgétaire."
        actions={
          canSchoolWide(ctx, "expenses.create") &&
          settings && (
            <FormDialog title="Nouvelle dépense" action={createExpenseAction} triggerLabel="Nouvelle dépense">
              <Field label="Description" htmlFor="e-desc">
                <Input id="e-desc" name="description" required minLength={3} maxLength={300} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Montant (${cur})`} htmlFor="e-amount">
                  <Input id="e-amount" name="amount" type="number" min={1} step="any" required />
                </Field>
                <Field label="Date" htmlFor="e-date">
                  <Input id="e-date" name="spent_on" type="date" max={isoDate()} defaultValue={isoDate()} required />
                </Field>
                <Field label="Catégorie" htmlFor="e-cat">
                  <Select id="e-cat" name="category_id" required>
                    {settings.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fournisseur" htmlFor="e-sup">
                  <Select id="e-sup" name="supplier_id" defaultValue="">
                    <option value="">—</option>
                    {settings.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Mode de paiement" htmlFor="e-method">
                  <Select id="e-method" name="method_id" defaultValue="">
                    <option value="">—</option>
                    {settings.methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Référence / n° de pièce" htmlFor="e-ref">
                  <Input id="e-ref" name="reference" maxLength={120} />
                </Field>
              </div>
            </FormDialog>
          )
        }
      />

      {budget?.data && budget.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Budget {year?.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {budget.data.map((b) => {
              const amount = Number(b.budget ?? 0);
              const pct = amount > 0 ? (Number(b.spent) / amount) * 100 : 0;
              return (
                <div key={b.category_id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{b.category_name}</span>
                    <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                      {formatMoney(b.spent, cur)} / {amount ? formatMoney(amount, cur) : "non défini"}
                      {can(ctx, "budgets.manage") && year && (
                        <FormDialog title={`Budget — ${b.category_name}`} action={saveBudgetAction} trigger={<Button variant="ghost" size="sm">Modifier</Button>}>
                          <input type="hidden" name="year_id" value={year.id} />
                          <input type="hidden" name="category_id" value={b.category_id} />
                          <Field label={`Montant annuel (${cur})`} htmlFor={`b-${b.category_id}`}>
                            <Input id={`b-${b.category_id}`} name="amount" type="number" min={0} step="any" defaultValue={amount || ""} required />
                          </Field>
                        </FormDialog>
                      )}
                    </span>
                  </div>
                  <Progress value={pct} tone={pct > 100 ? "danger" : pct > 85 ? "warning" : "brand"} />
                  {pct > 100 && <p className="text-xs font-medium text-destructive">Dépassement de {Math.round(pct - 100)} %</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {can(ctx, "expenses.read") &&
        (expenses.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title="Aucune dépense" />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH className="hidden md:table-cell">Catégorie</TH>
                  <TH className="text-right">Montant</TH>
                  <TH>Statut</TH>
                  {canValidate && <TH />}
                </TR>
              </THead>
              <TBody>
                {expenses.map((e) => (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap">{formatDate(e.spent_on)}</TD>
                    <TD>
                      {e.description}
                      {e.supplier?.name && <span className="block text-xs text-muted-foreground">{e.supplier.name}</span>}
                    </TD>
                    <TD className="hidden md:table-cell">{e.category?.name}</TD>
                    <TD className="text-right font-semibold tabular-nums">{formatMoney(Number(e.amount), cur)}</TD>
                    <TD>
                      <Badge variant={EXPENSE_STATUS[e.status]?.variant}>{EXPENSE_STATUS[e.status]?.label}</Badge>
                    </TD>
                    {canValidate && (
                      <TD className="text-right">
                        <ExpenseActions id={e.id} status={e.status} />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ))}
    </div>
  );
}
