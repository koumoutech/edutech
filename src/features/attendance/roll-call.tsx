"use client";

import { CheckCheckIcon, ClockIcon, Loader2Icon, UserCheckIcon, UserXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "./actions";

type Status = "present" | "absent" | "late" | "excused";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

const OPTIONS: { value: Status; label: string; short: string; icon: typeof UserCheckIcon; active: string }[] = [
  {
    value: "present",
    label: "Présent",
    short: "P",
    icon: UserCheckIcon,
    active: "bg-primary text-primary-foreground border-primary",
  },
  {
    value: "absent",
    label: "Absent",
    short: "A",
    icon: UserXIcon,
    active: "bg-destructive text-white border-destructive",
  },
  {
    value: "late",
    label: "Retard",
    short: "R",
    icon: ClockIcon,
    active: "bg-highlight text-highlight-foreground border-highlight",
  },
];

/**
 * Mobile-first roll call: everyone starts "present", one tap per exception,
 * large touch targets, sticky save bar, live counters.
 */
export function RollCall({
  classId,
  date,
  entryId,
  students,
  existing,
  justified,
}: {
  classId: string;
  date: string;
  entryId?: string;
  students: Student[];
  existing: { student_id: string; status: string; minutes_late: number | null }[];
  justified: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<Record<string, { status: Status; minutes?: number }>>(() => {
    const init: Record<string, { status: Status; minutes?: number }> = {};
    for (const s of students) {
      const prev = existing.find((e) => e.student_id === s.id);
      init[s.id] = prev
        ? { status: prev.status as Status, minutes: prev.minutes_late ?? undefined }
        : { status: justified.includes(s.id) ? "excused" : "present" };
    }
    return init;
  });
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const v of Object.values(state)) c[v.status]++;
    return c;
  }, [state]);

  const set = (id: string, status: Status) => setState((s) => ({ ...s, [id]: { ...s[id], status } }));

  const save = () =>
    start(async () => {
      const res = await saveAttendanceAction({
        class_id: classId,
        date,
        timetable_entry_id: entryId,
        records: students.map((s) => ({
          student_id: s.id,
          status: state[s.id].status,
          minutes_late: state[s.id].status === "late" ? (state[s.id].minutes ?? 5) : undefined,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.push("/app/attendance");
    });

  return (
    <div className="space-y-3 pb-24">
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="bg-brand-soft dark:bg-secondary rounded-xl p-2">
          <p className="text-xl font-bold tabular-nums">{counts.present + counts.excused}</p>
          <p className="text-xs">Présents</p>
        </div>
        <div className="bg-destructive/10 text-destructive rounded-xl p-2">
          <p className="text-xl font-bold tabular-nums">{counts.absent}</p>
          <p className="text-xs">Absents</p>
        </div>
        <div className="bg-highlight/20 rounded-xl p-2">
          <p className="text-xl font-bold tabular-nums">{counts.late}</p>
          <p className="text-xs">Retards</p>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          setState(
            Object.fromEntries(
              students.map((s) => [s.id, { status: justified.includes(s.id) ? "excused" : "present" }]),
            ) as typeof state,
          )
        }
      >
        <CheckCheckIcon /> Tout le monde présent
      </Button>

      <Card className="divide-y overflow-hidden">
        {students.map((s, i) => {
          const cur = state[s.id];
          return (
            <div
              key={s.id}
              className={cn(
                "p-3 transition-colors",
                cur.status === "absent" && "bg-destructive/5",
                cur.status === "late" && "bg-highlight/10",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">{i + 1}</span>
                <p className="min-w-0 flex-1 truncate font-medium">
                  {s.last_name.toUpperCase()} {s.first_name}
                  {cur.status === "excused" && (
                    <span className="text-primary ml-2 text-xs font-normal">absence justifiée</span>
                  )}
                </p>
                <div
                  role="radiogroup"
                  aria-label={`Présence de ${s.first_name} ${s.last_name}`}
                  className="flex gap-1.5"
                >
                  {OPTIONS.map((o) => {
                    const on = cur.status === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={o.label}
                        title={o.label}
                        onClick={() => set(s.id, on && o.value !== "present" ? "present" : o.value)}
                        className={cn(
                          "flex size-11 items-center justify-center rounded-xl border text-sm font-bold transition-all active:scale-95",
                          on ? o.active : "bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {o.short}
                      </button>
                    );
                  })}
                </div>
              </div>
              {cur.status === "late" && (
                <label className="mt-2 ml-9 flex items-center gap-2 text-sm">
                  Minutes de retard
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    value={cur.minutes ?? 5}
                    onChange={(e) =>
                      setState((st) => ({ ...st, [s.id]: { ...st[s.id], minutes: Number(e.target.value) } }))
                    }
                    className="h-9 w-20"
                  />
                </label>
              )}
            </div>
          );
        })}
      </Card>

      <div className="bg-card/95 fixed inset-x-0 bottom-16 z-30 border-t p-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="text-muted-foreground flex-1 text-sm">
            {students.length} élèves · {counts.absent} absent(s) · {counts.late} retard(s)
          </p>
          <Button size="lg" onClick={save} disabled={pending || students.length === 0}>
            {pending && <Loader2Icon className="animate-spin" />} Valider l&apos;appel
          </Button>
        </div>
      </div>
    </div>
  );
}
