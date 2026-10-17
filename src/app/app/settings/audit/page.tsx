import type { Metadata } from "next";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { auditLog } from "@/server/services/admin";

export const metadata: Metadata = { title: "Journal d'audit" };

function summarize(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  const keys = Object.keys(changes as Record<string, unknown>).filter((k) => !["id", "school_id", "created_at", "updated_at"].includes(k));
  return keys.slice(0, 6).join(", ") + (keys.length > 6 ? "…" : "");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("audit.read", ["school"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const entity = sp.entity && /^[a-z_]{2,40}$/.test(sp.entity) ? sp.entity : undefined;
  const { rows, total } = await auditLog(ctx, page, entity);
  return (
    <div className="space-y-5">
      <PageHeader title="Journal d'audit" description="Journal en ajout seul : notes, paiements, inscriptions, rôles, exports, documents. Les données sensibles sont masquées." />
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Auteur</TH>
              <TH>Action</TH>
              <TH>Objet</TH>
              <TH className="hidden md:table-cell">Détail</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap">{formatDateTime(r.created_at)}</TD>
                <TD>{r.actor}</TD>
                <TD>
                  <Badge variant={r.action.startsWith("delete") || r.action === "reverse" || r.action === "refund" ? "warning" : "muted"}>{r.action}</Badge>
                </TD>
                <TD>
                  <a href={`?entity=${r.entity_type}`} className="hover:text-primary">
                    {r.entity_type}
                  </a>
                </TD>
                <TD className="hidden max-w-sm truncate text-xs text-muted-foreground md:table-cell">
                  {r.reason ? `Motif : ${r.reason} · ` : ""}
                  {summarize(r.changes)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="border-t px-4 pb-4">
          <Pagination page={page} pageSize={50} total={total} basePath="/app/settings/audit" params={{ entity }} />
        </div>
      </Card>
    </div>
  );
}
