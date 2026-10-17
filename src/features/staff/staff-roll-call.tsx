"use client";

import { CalendarOffIcon, ClockIcon, Loader2Icon, UserCheckIcon, UserXIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { saveStaffAttendanceAction } from "./actions";

type Status = "present" | "absent" | "late" | "on_leave";

const OPTIONS: { value: Status; label: string; icon: typeof UserCheckIcon; active: string }[] = [
  {
    value: "present",
    label: "Présent",
    icon: UserCheckIcon,
    active: "bg-primary text-primary-foreground border-primary",
  },
  { value: "absent", label: "Absent", icon: UserXIcon, active: "bg-destructive text-white border-destructive" },
  {
    value: "late",
    label: "Retard",
    icon: ClockIcon,
    active: "bg-highlight text-highlight-foreground border-highlight",
  },
  {
    value: "on_leave",
    label: "Congé",
    icon: CalendarOffIcon,
    active: "bg-secondary text-secondary-foreground border-secondary",
  },
];

interface Row {
  status: Status;
  minutes: number | null;
  note: string;
}

export function StaffRollCall({
  date,
  staff,
  existing,
  onLeave,
  editable,
}: {
  date: string;
  staff: { id: string; first_name: string; last_name: string; job_title: string | null }[];
  existing: { staff_id: string; status: string; minutes_late: number | null; note: string | null }[];
  onLeave: string[];
  editable: boolean;
}) {
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      staff.map((s) => {
        const prev = existing.find((e) => e.staff_id === s.id);
        return [
          s.id,
          prev
            ? { status: prev.status as Status, minutes: prev.minutes_late, note: prev.note ?? "" }
            : { status: onLeave.includes(s.id) ? "on_leave" : "present", minutes: null, note: "" },
        ];
      }),
    ),
  );
  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, late: 0, on_leave: 0 };
    for (const r of Object.values(rows)) c[r.status]++;
    return c;
  }, [rows]);
  const update = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  function save() {
    start(async () => {
      const res = await saveStaffAttendanceAction({
        date,
        records: staff.map((s) => ({
          staff_id: s.id,
          status: rows[s.id].status,
          minutes_late: rows[s.id].status === "late" ? (rows[s.id].minutes ?? 5) : null,
          note: rows[s.id].note.trim() || null,
        })),
      });
      if (res.ok) toast.success(res.message ?? "Pointage enregistré.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {counts.present} présent(s) · {counts.absent} absent(s) · {counts.late} retard(s) · {counts.on_leave} en congé
      </p>
      <ul className="bg-card divide-y rounded-xl border">
        {staff.map((s) => {
          const row = rows[s.id];
          return (
            <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {s.last_name.toUpperCase()} {s.first_name}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {s.job_title ?? "—"}
                  {onLeave.includes(s.id) && " · congé approuvé ce jour"}
                </p>
              </div>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="radiogroup"
                aria-label={`Statut de ${s.first_name} ${s.last_name}`}
              >
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={row.status === o.value}
                    disabled={!editable}
                    onClick={() => update(s.id, { status: o.value })}
                    className={cn(
                      "inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-60",
                      row.status === o.value ? o.active : "bg-background hover:bg-accent",
                    )}
                  >
                    <o.icon className="size-3.5" aria-hidden /> {o.label}
                  </button>
                ))}
                {row.status === "late" && (
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={row.minutes ?? ""}
                    onChange={(e) => update(s.id, { minutes: e.target.value ? Number(e.target.value) : null })}
                    aria-label="Minutes de retard"
                    placeholder="min"
                    className="h-9 w-20"
                    disabled={!editable}
                  />
                )}
                {row.status !== "present" && (
                  <Input
                    value={row.note}
                    onChange={(e) => update(s.id, { note: e.target.value })}
                    aria-label="Remarque"
                    placeholder="Remarque"
                    maxLength={300}
                    className="h-9 w-full sm:w-44"
                    disabled={!editable}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editable && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button onClick={save} disabled={pending} size="lg" className="shadow-lg">
            {pending && <Loader2Icon className="animate-spin motion-reduce:animate-none" />} Enregistrer le pointage
          </Button>
        </div>
      )}
    </div>
  );
}
