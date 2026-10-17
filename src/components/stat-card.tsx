import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

/** KPI tile. `tone` signals state (warning/danger) — always paired with text, never color alone. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = "default",
  suffix,
  formatted,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: string;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  suffix?: string;
  /** Pre-formatted value (money...) displayed instead of the animated counter. */
  formatted?: string;
}) {
  const body = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)] transition-all duration-200",
        href && "hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "default" && "bg-brand-soft text-primary dark:bg-secondary",
            tone === "success" && "bg-brand-soft text-primary dark:bg-secondary",
            tone === "warning" && "bg-highlight/25 text-[#7a5b00] dark:text-highlight",
            tone === "danger" && "bg-destructive/12 text-destructive",
          )}
        >
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">
        {formatted ?? <AnimatedNumber value={value} />}
        {suffix && <span className="ml-0.5 text-base font-semibold text-muted-foreground">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
