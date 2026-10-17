import { AlertTriangleIcon, BellIcon, ChevronRightIcon, InfoIcon, MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { cn, formatDateTime } from "@/lib/utils";
import type { Alert } from "@/server/services/dashboard";

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}

export function AlertsList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">Rien à traiter pour le moment. 🎉</p>;
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li key={a.label}>
          <Link
            href={a.href}
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
          >
            {a.tone === "danger" ? (
              <AlertTriangleIcon className="size-4 shrink-0 text-destructive" aria-hidden />
            ) : a.tone === "warning" ? (
              <AlertTriangleIcon className="size-4 shrink-0 text-[#a37800] dark:text-highlight" aria-hidden />
            ) : (
              <InfoIcon className="size-4 shrink-0 text-primary" aria-hidden />
            )}
            <span className="flex-1">{a.label}</span>
            <Badge variant={a.tone === "danger" ? "danger" : a.tone === "warning" ? "warning" : "default"}>{a.count}</Badge>
            <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AnnouncementsList({
  items,
}: {
  items: { id: string; title: string; body: string; priority: string; is_pinned: boolean; published_at: string | null }[];
}) {
  if (!items.length) return <EmptyState icon={MegaphoneIcon} title="Aucune annonce" className="py-8" />;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 truncate text-sm font-semibold">{a.title}</p>
            {a.priority !== "normal" && <Badge variant={a.priority === "urgent" ? "danger" : "warning"}>{a.priority === "urgent" ? "Urgent" : "Important"}</Badge>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.body}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{formatDateTime(a.published_at)}</p>
        </li>
      ))}
    </ul>
  );
}

export function NotificationsList({
  items,
}: {
  items: { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[];
}) {
  if (!items.length) return <EmptyState icon={BellIcon} title="Aucune notification" className="py-8" />;
  return (
    <ul className="divide-y">
      {items.map((n) => {
        const content = (
          <div className="flex gap-3 py-2.5">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
            <div className="min-w-0">
              <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
              {n.body && <p className="line-clamp-1 text-xs text-muted-foreground">{n.body}</p>}
              <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
            </div>
          </div>
        );
        return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-muted/40">{content}</Link> : content}</li>;
      })}
    </ul>
  );
}

export function Greeting({ name, subtitle }: { name: string; subtitle: string }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">
        {hello}, {name.split(" ")[0]} 👋
      </h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
