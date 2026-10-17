import { cn, WEEKDAYS } from "@/lib/utils";

export interface GridEntry {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  title: string;
  subtitle: string;
  color: string | null;
  badge?: string;
}

/**
 * Responsive week view: one column per day on desktop, stacked day cards on phones.
 * Rendered on the server; printable.
 */
export function WeekGrid({ entries, days = 5, actions }: { entries: GridEntry[]; days?: number; actions?: (e: GridEntry) => React.ReactNode }) {
  const byDay = Array.from({ length: days }, (_, i) => entries.filter((e) => e.weekday === i + 1).sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
  return (
    <div className={cn("grid gap-3", days === 6 ? "md:grid-cols-6" : "md:grid-cols-5")}>
      {byDay.map((list, i) => (
        <section key={i} aria-label={WEEKDAYS[i]} className="rounded-xl border bg-card p-2 print:break-inside-avoid">
          <h3 className="mb-2 px-1 text-sm font-semibold">{WEEKDAYS[i]}</h3>
          {list.length === 0 && <p className="px-1 pb-2 text-xs text-muted-foreground">Aucun cours</p>}
          <ol className="space-y-1.5">
            {list.map((e) => (
              <li
                key={e.id}
                className="group relative rounded-lg border-l-4 bg-muted/50 p-2 text-xs"
                style={{ borderLeftColor: e.color ?? "var(--primary)" }}
              >
                <p className="font-semibold tabular-nums">
                  {e.starts_at.slice(0, 5)}–{e.ends_at.slice(0, 5)}
                </p>
                <p className="text-sm font-medium">{e.title}</p>
                <p className="text-muted-foreground">{e.subtitle}</p>
                {e.badge && <p className="mt-1 font-semibold text-destructive">{e.badge}</p>}
                {actions && <div className="no-print absolute top-1 right-1">{actions(e)}</div>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
