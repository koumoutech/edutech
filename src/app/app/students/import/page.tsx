import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { ImportForm } from "@/features/students/import-form";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Importer des élèves" };

export default async function ImportStudentsPage() {
  await requirePermission("students.create");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Importer des élèves" description="Import CSV validé ligne par ligne, avec responsables et affectation en classe." />
      <ImportForm />
    </div>
  );
}
