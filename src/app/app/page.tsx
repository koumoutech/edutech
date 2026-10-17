import type { Metadata } from "next";
import { DirectionDashboard } from "@/features/dashboard/direction";
import { ParentDashboard, StudentDashboard } from "@/features/dashboard/family";
import { AccountantDashboard, HrDashboard, SecretaryDashboard, StaffDashboard } from "@/features/dashboard/staff-roles";
import { TeacherDashboard } from "@/features/dashboard/teacher";
import { canSchoolWide, dashboardKind } from "@/lib/authz";
import { requireContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const ctx = await requireContext();
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
      return canSchoolWide(ctx, "attendance.read") ? <DirectionDashboard ctx={ctx} academicOnly /> : <StaffDashboard ctx={ctx} />;
  }
}
