import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/misc";
import { MobileNav, Sidebar } from "@/features/navigation/app-nav";
import { buildNavigation } from "@/features/navigation/nav";
import { NotificationBell, SchoolSwitcher, TopBarActions, UserMenu } from "@/features/navigation/top-bar";
import { can } from "@/lib/authz";
import { requireContext } from "@/server/auth/session";
import { getBranding } from "@/server/platform";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const [ctx, branding] = await Promise.all([requireContext(), getBranding()]);
  const nav = buildNavigation({ permissions: ctx.permissions, roles: ctx.school.roles });
  const { count } = await ctx.db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .is("read_at", null);

  return (
    <div className="min-h-dvh">
      <Sidebar items={nav} productName={branding.productName} schoolName={ctx.school.name} />
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-lg sm:px-6">
          <div className="min-w-0 flex-1">
            <SchoolSwitcher
              activeId={ctx.school.id}
              schools={ctx.schools.map((s) => ({ id: s.id, name: s.name, isDemo: s.is_demo }))}
            />
          </div>
          <TopBarActions canUseAi={can(ctx, "ai.use")} />
          <NotificationBell userId={ctx.user.id} initialUnread={count ?? 0} />
          <UserMenu name={ctx.user.fullName} email={ctx.user.email} roles={ctx.school.roles.map((r) => r.name)} />
        </header>
        <main id="contenu" className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <MobileNav items={nav} productName={branding.productName} />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:pl-64">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar p-4 lg:block">
        <Skeleton className="mb-8 h-9 w-36" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-8" />
        ))}
      </div>
      <div className="flex h-16 items-center gap-3 border-b px-4">
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
