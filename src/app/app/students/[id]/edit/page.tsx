import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/ui/misc";
import { EditStudentForm } from "@/features/students/student-form";
import { fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "Modifier le dossier" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("students.update");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: s } = await ctx.db
    .from("students")
    .select("id, matricule, first_name, last_name, gender, birth_date, birth_place, nationality, address, phone, email, previous_school, notes")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const clean = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ""])) as Record<string, string>;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Modifier — ${fullName(s)}`} />
      <EditStudentForm student={{ ...clean, id: s.id, first_name: s.first_name, last_name: s.last_name } as never} />
    </div>
  );
}
