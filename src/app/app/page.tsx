import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { DirectionDashboard } from "@/features/dashboard/direction";
import { ParentDashboard, StudentDashboard } from "@/features/dashboard/family";
import { AccountantDashboard, HrDashboard, SecretaryDashboard, StaffDashboard } from "@/features/dashboard/staff-roles";
import { TeacherDashboard } from "@/features/dashboard/teacher";
import { canSchoolWide, dashboardKind, type AuthzSubject } from "@/lib/authz";
import { requireContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tableau de bord" };

const SENSITIVE: Parameters<typeof canSchoolWide>[1][] = [
  "users.manage",
  "roles.manage",
  "finance.manage",
  "payments.create",
  "hr.manage",
  "health.read",
];

function needsMfaNotice(ctx: AuthzSubject & { user: { mfaEnabled: boolean } }) {
  return !ctx.user.mfaEnabled && SENSITIVE.some((p) => canSchoolWide(ctx, p));
}

export default async function DashboardPage() {
  const ctx = await requireContext();
  return (
    <>
      {needsMfaNotice(ctx) && (
        <Alert tone="warning" title="Sécurisez votre compte" className="mb-5">
          Votre profil donne accès à des données sensibles. Activez la double authentification depuis{" "}
          <Link href="/app/profile" className="font-medium underline">
            votre profil
          </Link>
          .
        </Alert>
      )}
      <Dashboard ctx={ctx} />
    </>
  );
}

function Dashboard({ ctx }: { ctx: Awaited<ReturnType<typeof requireContext>> }) {
  switch (dashboardKind(ctx.school.roles)) {
    case "direction":
      return <DirectionDashboard ctx={ctx} />;
    case "academic":
      return <DirectionDashboard ctx={ctx} academicOnly />;
    case "teacher":
      return <TeacherDashboard ctx={ctx} />;
    case "secretary":
      return <SecretaryDashboard ctx={ctx} />;
    case "accountant":
      return <AccountantDashboard ctx={ctx} />;
    case "hr":
      return <HrDashboard ctx={ctx} />;
    case "parent":
      return <ParentDashboard ctx={ctx} />;
    case "student":
      return <StudentDashboard ctx={ctx} />;
    default:
      return canSchoolWide(ctx, "attendance.read") ? (
        <DirectionDashboard ctx={ctx} academicOnly />
      ) : (
        <StaffDashboard ctx={ctx} />
      );
  }
}
