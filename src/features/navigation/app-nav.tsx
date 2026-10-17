"use client";

import { MenuIcon, SparklesIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "./icons";
import { NAV_GROUP_LABELS, type NavItem } from "./nav";

function isActive(pathname: string, href: string, all: NavItem[]): boolean {
  if (href === "/app") return pathname === "/app";
  if (!(pathname === href || pathname.startsWith(`${href}/`))) return false;
  // Prefer the most specific matching entry (e.g. /app/staff/leaves over /app/staff).
  return !all.some((o) => o.href !== href && o.href.startsWith(href) && (pathname === o.href || pathname.startsWith(`${o.href}/`)));
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = Object.keys(NAV_GROUP_LABELS) as NavItem["group"][];
  return (
    <nav aria-label="Navigation de l'application" className="space-y-5">
      {groups.map((g) => {
        const entries = items.filter((i) => i.group === g);
        if (!entries.length) return null;
        return (
          <div key={g}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{NAV_GROUP_LABELS[g]}</p>
            <ul className="space-y-0.5">
              {entries.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = isActive(pathname, item.href, items);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg bg-brand-soft dark:bg-secondary"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <Icon className="relative size-[18px] shrink-0" aria-hidden />
                      <span className="relative truncate">{item.label}</span>
                      {item.icon === "assistant" && <SparklesIcon className="relative ml-auto size-3.5 text-highlight" aria-hidden />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ items, productName, schoolName }: { items: NavItem[]; productName: string; schoolName: string }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/app" aria-label="Tableau de bord">
          <Logo name={productName} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks items={items} />
      </div>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground">{schoolName}</p>
        <p>Espace établissement</p>
      </div>
    </aside>
  );
}

/** Compact bottom navigation for phones + a sheet with every entry. */
export function MobileNav({ items, productName }: { items: NavItem[]; productName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  return (
    <>
      <nav
        aria-label="Navigation rapide"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const active = isActive(pathname, item.href, items);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className={cn("rounded-full px-4 py-1 transition-colors", active && "bg-brand-soft dark:bg-secondary")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="max-w-full truncate px-1">{item.label.split(" ")[0]}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
              aria-haspopup="dialog"
            >
              <span className="px-4 py-1">
                <MenuIcon className="size-5" aria-hidden />
              </span>
              Menu
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh]">
          <div className="border-b p-5">
            <DialogTitle asChild>
              <div>
                <Logo name={productName} />
              </div>
            </DialogTitle>
          </div>
          <div className="overflow-y-auto p-3 pb-8">
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
