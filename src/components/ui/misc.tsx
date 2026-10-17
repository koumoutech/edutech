import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--muted)_0px,color-mix(in_oklab,var(--muted),white_45%)_120px,var(--muted)_240px)] bg-[length:800px_100%] dark:bg-[linear-gradient(90deg,var(--muted)_0px,color-mix(in_oklab,var(--muted),white_6%)_120px,var(--muted)_240px)]",
        className,
      )}
      {...props}
    />
  );
}

export function Separator({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("border-border", className)} {...props} />;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-deep dark:bg-secondary dark:text-secondary-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "warning" | "danger" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          tone === "brand" && "bg-primary",
          tone === "warning" && "bg-highlight",
          tone === "danger" && "bg-destructive",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand-soft blur-xl dark:bg-secondary" aria-hidden />
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-card shadow-[var(--shadow-soft)]">
          <Icon className="size-7 text-primary" aria-hidden />
        </div>
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tone === "info" && "border-border bg-muted/60",
        tone === "success" && "border-primary/25 bg-brand-soft text-brand-deep dark:bg-secondary dark:text-secondary-foreground",
        tone === "warning" && "border-highlight/50 bg-highlight/15",
        tone === "danger" && "border-destructive/30 bg-destructive/8 text-destructive",
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-xs font-semibold tracking-wider text-primary uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-[1.7rem]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
