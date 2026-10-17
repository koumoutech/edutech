"use client";

import { BellIcon, CheckIcon, ChevronsUpDownIcon, LogOutIcon, SchoolIcon, SparklesIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/misc";
import { getBrowserClient } from "@/lib/supabase/browser";
import { signOut } from "@/features/auth/actions";
import { switchSchool } from "./actions";

interface SchoolOption {
  id: string;
  name: string;
  isDemo: boolean;
}

export function SchoolSwitcher({ schools, activeId }: { schools: SchoolOption[]; activeId: string }) {
  const [pending, start] = useTransition();
  const active = schools.find((s) => s.id === activeId);
  if (schools.length <= 1) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <SchoolIcon className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{active?.name}</span>
        {active?.isDemo && <Badge variant="warning">Démo</Badge>}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 justify-start gap-2 px-2" disabled={pending}>
          <SchoolIcon className="text-primary" aria-hidden />
          <span className="truncate">{active?.name}</span>
          <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Changer d&apos;établissement</DropdownMenuLabel>
        {schools.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() =>
              start(async () => {
                const res = await switchSchool(s.id);
                if (!res.ok) toast.error(res.error);
              })
            }
          >
            <span className="flex-1 truncate">{s.name}</span>
            {s.isDemo && <Badge variant="warning">Démo</Badge>}
            {s.id === activeId && <CheckIcon className="text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Unread counter kept up to date through Supabase Realtime (user's own rows only, enforced by RLS). */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [seenInitial, setSeenInitial] = useState(initialUnread);
  // Reset when the server sends a fresh count (e.g. after marking notifications as read).
  if (seenInitial !== initialUnread) {
    setSeenInitial(initialUnread);
    setUnread(initialUnread);
  }
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        setUnread((n) => n + 1);
        const title = (payload.new as { title?: string }).title;
        if (title) toast(title);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/app/notifications" aria-label={unread ? `Notifications : ${unread} non lues` : "Notifications"}>
        <BellIcon />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

export function UserMenu({ name, email, roles }: { name: string; email: string; roles: string[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menu du compte">
          <Avatar name={name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map((r) => (
              <Badge key={r} variant="muted">
                {r}
              </Badge>
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/profile">
            <UserIcon /> Mon profil et sécurité
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut();
          }}
          className="text-destructive data-[highlighted]:text-destructive"
        >
          <LogOutIcon className="!text-destructive" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBarActions({ canUseAi }: { canUseAi: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {canUseAi && (
        <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
          <Link href="/app/assistant" aria-label="Assistant IA">
            <SparklesIcon className="text-highlight" />
          </Link>
        </Button>
      )}
      <ThemeToggle />
    </div>
  );
}
