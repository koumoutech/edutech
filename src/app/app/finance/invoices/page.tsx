import { DownloadIcon, FilePlus2Icon, ReceiptIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormDialog } from "@/components/inline-form";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { generateClassInvoicesAction } from "@/features/finance/actions";
import { FEE_CATEGORIES, INVOICE_STATUS } from "@/features/finance/labels";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, fullName, isoDate } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { getCurrentYear, listClasses } from "@/server/repositories/academic";
import { financeSettings, INVOICES_PAGE_SIZE, invoiceListSchema, listInvoices } from "@/server/services/finance";

export const metadata: Metadata = { title: "Factures" };

const FILTERS: [string, string][] = [
  ["all", "Toutes"],
  ["open", "À payer"],
  ["overdue", "En retard"],
  ["paid", "Payées"],
  ["draft", "Brouillons"],
  ["cancelled", "Annulées"],
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("finance.read", ["school"]);
  const query = invoiceListSchema.parse(await searchParams);
  const { rows, total } = await listInvoices(ctx, query);
  const canCreate = canSchoolWide(ctx, "invoices.create");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const [classes, settings] = canCreate && year ? await Promise.all([listClasses(ctx.db, ctx.school.id, year.id), financeSettings(ctx)]) : [[], null];
  const schedules = (settings?.schedules ?? []).filter((s) => s.academic_year_id === year?.id);
  const cur = ctx.school.currency;
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Factures"
        description="Montants facturés, encaissés et restant dus."
        actions={
          <>
            {can(ctx, "finance.export") && (
              <Button asChild variant="outline">
                <a href="/api/export/invoices" download>
                  <DownloadIcon /> Exporter
                </a>
              </Button>
            )}
            {canCreate && schedules.length > 0 && (
              <FormDialog title="Facturer une classe" action={generateClassInvoicesAction} triggerLabel="Facturer une classe" triggerVariant="outline" submitLabel="Générer les factures">
                <p className="text-sm text-muted-foreground">
                  Une facture par élève actif, à partir des frais de son niveau. Les réductions et bourses sont appliquées ; les frais déjà facturés sont ignorés.
                </p>
                <Field label="Classe" htmlFor="gi-class">
                  <Select id="gi-class" name="class_id" required>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium">Frais à facturer</legend>
                  {schedules.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="schedules[]" value={s.id} className="size-4 accent-[var(--primary)]" />
                      {s.fee_type?.name} — {s.level?.name ?? "tous niveaux"} — {formatMoney(Number(s.amount), cur)}
                      <span className="text-xs text-muted-foreground">({FEE_CATEGORIES[s.fee_type?.category ?? "other"]})</span>
                    </label>
                  ))}
                </fieldset>
                <Field label="Échéance" htmlFor="gi-due">
                  <Input id="gi-due" name="due_date" type="date" min={isoDate()} defaultValue={isoDate(in30)} required />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="issue" defaultChecked className="size-4 accent-[var(--primary)]" /> Émettre immédiatement (notifie les familles)
                </label>
              </FormDialog>
            )}
            {canCreate && (
              <Button asChild>
                <Link href="/app/finance/invoices/new">
                  <FilePlus2Icon /> Nouvelle facture
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([k, label]) => (
            <Link
              key={k}
              href={`/app/finance/invoices?filter=${k}${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${query.filter === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2" role="search">
          <input type="hidden" name="filter" value={query.filter} />
          <label className="relative flex-1">
            <span className="sr-only">Rechercher un élève</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={query.q} placeholder="Nom ou matricule de l'élève…" className="pl-9" />
          </label>
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="Aucune facture" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Facture</TH>
                <TH>Élève</TH>
                <TH className="hidden md:table-cell">Échéance</TH>
                <TH className="hidden text-right sm:table-cell">Total</TH>
                <TH className="text-right">Reste dû</TH>
                <TH>Statut</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-primary">
                      {i.number}
                    </Link>
                  </TD>
                  <TD>{fullName(i.student)}</TD>
                  <TD className="hidden md:table-cell">
                    {formatDate(i.due_date)}
                    {Number(i.balance) > 0 && ["issued", "partially_paid"].includes(i.status) && i.due_date < isoDate() && (
                      <Badge variant="danger" className="ml-2">
                        En retard
                      </Badge>
                    )}
                  </TD>
                  <TD className="hidden text-right tabular-nums sm:table-cell">{formatMoney(i.total, cur)}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatMoney(i.balance, cur)}</TD>
                  <TD>
                    <Badge variant={INVOICE_STATUS[i.status]?.variant}>{INVOICE_STATUS[i.status]?.label}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="border-t px-4 pb-4">
            <Pagination page={query.page} pageSize={INVOICES_PAGE_SIZE} total={total} basePath="/app/finance/invoices" params={{ filter: query.filter, q: query.q }} />
          </div>
        </Card>
      )}
    </div>
  );
}
