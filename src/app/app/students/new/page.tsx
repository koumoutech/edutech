import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { NewStudentForm } from "@/features/students/student-form";
import { can } from "@/lib/authz";
import { requirePermission } from "@/server/auth/session";
import { getCurrentYear, listClasses } from "@/server/repositories/academic";

export const metadata: Metadata = { title: "Nouvel élève" };

export default async function NewStudentPage() {
  const ctx = await requirePermission("students.create");
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const classes = year ? await listClasses(ctx.db, ctx.school.id, year.id) : [];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Nouvelle inscription" description={year ? `Année scolaire ${year.name}` : undefined} />
      <NewStudentForm classes={classes.map((c) => ({ id: c.id, name: c.name }))} canEnroll={can(ctx, "enrollments.manage")} />
    </div>
  );
}
