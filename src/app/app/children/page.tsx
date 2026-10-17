import type { Metadata } from "next";
import { ParentDashboard } from "@/features/dashboard/family";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Mes enfants" };

export default async function ChildrenPage() {
  const ctx = await requirePermission("students.read", ["linked"]);
  return <ParentDashboard ctx={ctx} />;
}
