"use client";

import { CheckCircle2Icon, EyeIcon, FileDownIcon, Loader2Icon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatScore } from "@/lib/utils";
import { setReportCardsStatusAction } from "./actions";
import { REPORT_CARD_STATUS } from "./labels";

interface Card_ {
  id: string;
  studentId: string;
  name: string;
  average: number | null;
  rank: number | null;
  classSize: number | null;
  mention: string | null;
  status: string;
}

export function ReportCardTable({ cards, canValidate, canPublish }: { cards: Card_[]; canValidate: boolean; canPublish: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const run = (status: string, ids: string[]) =>
    start(async () => {
      const res = await setReportCardsStatusAction(ids, status);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`${res.message} (${res.data.updated})`);
        setSelected(new Set());
        router.refresh();
      }
    });
  const ids = (status: string) => cards.filter((c) => (selected.size ? selected.has(c.id) : true) && c.status === status).map((c) => c.id);
  const selectable = canValidate || canPublish;

  return (
    <Card className="overflow-hidden">
      {selectable && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <p className="mr-auto text-sm text-muted-foreground">{selected.size ? `${selected.size} sélectionné(s)` : "Actions sur toute la classe"}</p>
          {canValidate && (
            <Button size="sm" variant="outline" disabled={pending || !ids("draft").length} onClick={() => run("validated", ids("draft"))}>
              {pending ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />} Valider ({ids("draft").length})
            </Button>
          )}
          {canPublish && (
            <Button size="sm" variant="highlight" disabled={pending || !ids("validated").length} onClick={() => run("published", ids("validated"))}>
              <EyeIcon /> Publier ({ids("validated").length})
            </Button>
          )}
          {canValidate && (
            <Button size="sm" variant="ghost" disabled={pending || !selected.size} onClick={() => run("draft", [...selected])}>
              <Undo2Icon /> Repasser en brouillon
            </Button>
          )}
        </div>
      )}
      <Table>
        <THead>
          <TR>
            {selectable && (
              <TH className="w-8">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  className="size-4 accent-[var(--primary)]"
                  checked={selected.size === cards.length && cards.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(cards.map((c) => c.id)) : new Set())}
                />
              </TH>
            )}
            <TH>Rang</TH>
            <TH>Élève</TH>
            <TH className="text-right">Moyenne</TH>
            <TH className="hidden sm:table-cell">Mention</TH>
            <TH>Statut</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {cards.map((c) => (
            <TR key={c.id}>
              {selectable && (
                <TD>
                  <input type="checkbox" aria-label={`Sélectionner ${c.name}`} className="size-4 accent-[var(--primary)]" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                </TD>
              )}
              <TD className="tabular-nums">{c.rank ? `${c.rank}/${c.classSize}` : "—"}</TD>
              <TD>
                <Link href={`/app/report-cards/${c.id}`} className="font-medium hover:text-primary">
                  {c.name}
                </Link>
              </TD>
              <TD className="text-right font-semibold tabular-nums">{formatScore(c.average)}</TD>
              <TD className="hidden sm:table-cell">{c.mention ?? "—"}</TD>
              <TD>
                <Badge variant={REPORT_CARD_STATUS[c.status]?.variant}>{REPORT_CARD_STATUS[c.status]?.label}</Badge>
              </TD>
              <TD className="text-right">
                <Button asChild variant="ghost" size="icon-sm">
                  <a href={`/api/report-cards/${c.id}`} target="_blank" rel="noopener" aria-label={`PDF de ${c.name}`}>
                    <FileDownIcon />
                  </a>
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
