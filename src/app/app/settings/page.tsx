import {
  BellIcon,
  BuildingIcon,
  CalendarRangeIcon,
  FileTextIcon,
  KeyRoundIcon,
  type LucideIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { can, type Permission } from "@/lib/authz";
import { requireContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Paramètres" };

const SECTIONS: { href: string; title: string; text: string; icon: LucideIcon; any: Permission[] }[] = [
  {
    href: "/app/settings/school",
    title: "Établissement",
    text: "Identité visuelle, logo, coordonnées, devise, fuseau horaire, barème de notation.",
    icon: BuildingIcon,
    any: ["school.manage", "academics.manage"],
  },
  {
    href: "/app/settings/academics",
    title: "Organisation pédagogique",
    text: "Années scolaires, périodes, niveaux, matières, salles, horaires.",
    icon: CalendarRangeIcon,
    any: ["academics.manage"],
  },
  {
    href: "/app/finance/settings",
    title: "Frais scolaires",
    text: "Frais par niveau, échéanciers, réductions, bourses, modes de paiement.",
    icon: WalletIcon,
    any: ["finance.manage", "finance.read"],
  },
  {
    href: "/app/documents",
    title: "Modèles de documents",
    text: "Certificats, attestations, convocations personnalisables.",
    icon: FileTextIcon,
    any: ["templates.manage"],
  },
  {
    href: "/app/settings/users",
    title: "Utilisateurs & invitations",
    text: "Comptes, invitations, suspension, attribution des rôles.",
    icon: UsersIcon,
    any: ["users.read"],
  },
  {
    href: "/app/settings/roles",
    title: "Rôles & permissions",
    text: "Matrice des permissions par rôle et portée (établissement, classes, enfants, soi-même).",
    icon: KeyRoundIcon,
    any: ["users.read", "roles.manage"],
  },
  {
    href: "/app/notifications",
    title: "Notifications",
    text: "Vos préférences de réception (application, e-mail, SMS).",
    icon: BellIcon,
    any: [],
  },
  {
    href: "/app/settings/audit",
    title: "Journal d'audit",
    text: "Traçabilité des opérations sensibles.",
    icon: ScrollTextIcon,
    any: ["audit.read"],
  },
  {
    href: "/app/profile",
    title: "Sécurité & confidentialité",
    text: "Mot de passe, sessions actives, historique de connexion.",
    icon: ShieldCheckIcon,
    any: [],
  },
];

export default async function SettingsPage() {
  const ctx = await requireContext();
  const sections = SECTIONS.filter((s) => !s.any.length || s.any.some((p) => can(ctx, p)));
  if (!sections.length) redirect("/app/forbidden");
  return (
    <div className="space-y-5">
      <PageHeader title="Paramètres" description={ctx.school.name} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
          >
            <Card className="flex h-full gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="bg-brand-soft text-primary dark:bg-secondary flex size-11 shrink-0 items-center justify-center rounded-xl">
                <s.icon className="size-5" aria-hidden />
              </div>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-muted-foreground mt-1 text-sm">{s.text}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
