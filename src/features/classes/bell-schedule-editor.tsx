"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { saveBellPeriodsAction } from "./actions";

interface Period {
  label: string;
  starts_at: string;
  ends_at: string;
  is_break: boolean;
}

export function BellScheduleEditor({ initial }: { initial: Period[] }) {
  const [rows, setRows] = useState<Period[]>(
    initial.length ? initial : [{ label: "M1", starts_at: "08:00", ends_at: "08:55", is_break: false }],
  );
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<Period>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horaires de la journée</CardTitle>
        <CardDescription>Créneaux de cours et pauses utilisés par les emplois du temps.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
            <Input aria-label="Libellé" value={r.label} onChange={(e) => update(i, { label: e.target.value })} />
            <Input
              aria-label="Début"
              type="time"
              value={r.starts_at}
              onChange={(e) => update(i, { starts_at: e.target.value })}
              className="w-28"
            />
            <Input
              aria-label="Fin"
              type="time"
              value={r.ends_at}
              onChange={(e) => update(i, { ends_at: e.target.value })}
              className="w-28"
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={r.is_break}
                onChange={(e) => update(i, { is_break: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />{" "}
              Pause
            </label>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
              aria-label="Supprimer le créneau"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((x) => [
                ...x,
                {
                  label: `C${x.length + 1}`,
                  starts_at: x.at(-1)?.ends_at ?? "08:00",
                  ends_at: x.at(-1)?.ends_at ?? "09:00",
                  is_break: false,
                },
              ])
            }
          >
            <PlusIcon /> Ajouter un créneau
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveBellPeriodsAction(rows);
                if (res.ok) toast.success(res.message);
                else toast.error(res.error);
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />} Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
