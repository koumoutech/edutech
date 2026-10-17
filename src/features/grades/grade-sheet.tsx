"use client";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { cn, formatScore } from "@/lib/utils";
import { saveGradesAction } from "./actions";

interface Row {
  student_id: string;
  name: string;
  matricule: string;
  score: string;
  is_absent: boolean;
  comment: string;
}

/** Keyboard-friendly grade entry: Enter/↓ moves to the next student, invalid scores are highlighted live. */
export function GradeSheet({
  assessmentId,
  maxScore,
  students,
  grades,
  readOnly,
}: {
  assessmentId: string;
  maxScore: number;
  students: { id: string; first_name: string; last_name: string; matricule: string }[];
  grades: { student_id: string; score: number | null; is_absent: boolean; comment: string | null }[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<Row[]>(() =>
    students.map((s) => {
      const g = grades.find((x) => x.student_id === s.id);
      return {
        student_id: s.id,
        name: `${s.last_name.toUpperCase()} ${s.first_name}`,
        matricule: s.matricule,
        score: g?.score === null || g?.score === undefined ? "" : String(g.score),
        is_absent: g?.is_absent ?? false,
        comment: g?.comment ?? "",
      };
    }),
  );
  const [dirty, setDirty] = useState(false);

  const parse = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const invalid = (r: Row) => {
    if (r.is_absent || r.score.trim() === "") return false;
    const n = parse(r.score);
    return n === null || Number.isNaN(n) || n < 0 || n > maxScore;
  };
  const stats = useMemo(() => {
    const vals = rows.filter((r) => !r.is_absent && !invalid(r)).map((r) => parse(r.score)).filter((n): n is number => n !== null);
    return {
      entered: vals.length + rows.filter((r) => r.is_absent).length,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const hasErrors = rows.some(invalid);

  const update = (i: number, patch: Partial<Row>) => {
    setDirty(true);
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const save = () =>
    start(async () => {
      const payload = rows
        .filter((r) => r.is_absent || r.score.trim() !== "" || grades.some((g) => g.student_id === r.student_id))
        .map((r) => ({
          student_id: r.student_id,
          score: r.is_absent ? null : parse(r.score),
          is_absent: r.is_absent,
          comment: r.comment || undefined,
        }));
      const res = await saveGradesAction({ assessment_id: assessmentId, grades: payload });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setDirty(false);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Saisies", `${stats.entered}/${rows.length}`],
          ["Moyenne", stats.avg === null ? "—" : `${formatScore(stats.avg)}/${formatScore(maxScore)}`],
          ["Min.", formatScore(stats.min)],
          ["Max.", formatScore(stats.max)],
        ].map(([k, v]) => (
          <Card key={k} className="p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <Card className="divide-y overflow-hidden">
        {rows.map((r, i) => (
          <div key={r.student_id} className={cn("flex flex-wrap items-center gap-3 p-3", invalid(r) && "bg-destructive/5")}>
            <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.matricule}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Note de ${r.name}`}
                inputMode="decimal"
                data-grade-index={i}
                value={r.is_absent ? "" : r.score}
                disabled={readOnly || r.is_absent}
                aria-invalid={invalid(r)}
                placeholder={r.is_absent ? "Abs." : `/${formatScore(maxScore)}`}
                onChange={(e) => update(i, { score: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    (document.querySelector(`[data-grade-index="${i + 1}"]`) as HTMLInputElement | null)?.focus();
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    (document.querySelector(`[data-grade-index="${i - 1}"]`) as HTMLInputElement | null)?.focus();
                  }
                }}
                className="w-24 text-right tabular-nums"
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={r.is_absent}
                  disabled={readOnly}
                  onChange={(e) => update(i, { is_absent: e.target.checked, score: e.target.checked ? "" : r.score })}
                  className="size-4 accent-[var(--primary)]"
                />
                Absent
              </label>
            </div>
            <Input
              aria-label={`Appréciation pour ${r.name}`}
              value={r.comment}
              disabled={readOnly}
              maxLength={500}
              onChange={(e) => update(i, { comment: e.target.value })}
              placeholder="Appréciation (facultatif)"
              className="w-full sm:w-64"
            />
          </div>
        ))}
      </Card>
      {!readOnly && (
        <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 backdrop-blur lg:bottom-4">
          <p className="text-sm text-muted-foreground">{hasErrors ? `Notes invalides (barème /${formatScore(maxScore)})` : dirty ? "Modifications non enregistrées" : "À jour"}</p>
          <Button onClick={save} disabled={pending || hasErrors || !dirty}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}
