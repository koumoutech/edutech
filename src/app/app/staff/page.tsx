import { BriefcaseIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { saveStaffAction } from "@/features/staff/actions";
import { StaffFormFields } from "@/features/staff/staff-form-fields";
import { canSchoolWide } from "@/lib/authz";
import { fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { listStaff } from "@/server/services/staff";

export const metadata: Metadata = { title: "Personnel" };

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("staff.read");
  if (!canSchoolWide(ctx, "staff.read")) {
    if (ctx.school.staff_id) redirect(`/app/staff/${ctx.school.staff_id}`);
    redirect("/app/forbidden");
  }
  const sp = await searchParams;
  const rows = await listStaff(ctx, { q: sp.q?.slice(0, 60), teachers: sp.filter === "teachers" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personnel"
        description={`${rows.length} membre(s) — enseignants, administration, vie scolaire.`}
        actions={
          canSchoolWide(ctx, "staff.manage") && (
            <FormDialog title="Nouveau membre du personnel" action={saveStaffAction} triggerLabel="Ajouter">
              <StaffFormFields />
            </FormDialog>
          )
        }
      />
      <Card className="p-3">
        <form className="flex flex-col gap-2 sm:flex-row" role="search">
          <label className="relative flex-1">
            <span className="sr-only">Rechercher</span>
            <SearchIcon
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input name="q" defaultValue={sp.q} placeholder="Nom, fonction, matricule…" className="pl-9" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="filter"
              value="teachers"
              defaultChecked={sp.filter === "teachers"}
              className="size-4 accent-[var(--primary)]"
            />{" "}
            Enseignants uniquement
          </label>
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
        </form>
      </Card>
      {rows.length === 0 ? (
        <EmptyState icon={BriefcaseIcon} title="Aucun membre du personnel" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Link
              key={s.id}
              href={`/app/staff/${s.id}`}
              className="focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2"
            >
              <Card className="flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <Avatar name={fullName(s)} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fullName(s)}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.job_title}
                    {s.department ? ` · ${s.department}` : ""}
                  </p>
                  <div className="mt-1 flex gap-1">
                    {s.is_teacher && <Badge>Enseignant</Badge>}
                    {s.status === "on_leave" && <Badge variant="warning">En congé</Badge>}
                    {!s.user_id && <Badge variant="outline">Sans compte</Badge>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
