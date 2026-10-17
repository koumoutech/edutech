import { DownloadIcon, FileWarningIcon, SearchIcon, UploadIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form-controls";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, fullName } from "@/lib/utils";
import { STUDENT_STATUS_LABELS, studentListQuerySchema } from "@/schemas/students";
import { requirePermission } from "@/server/auth/session";
import { listClasses } from "@/server/repositories/academic";
import { listStudents, STUDENTS_PAGE_SIZE } from "@/server/services/students";

export const metadata: Metadata = { title: "Élèves" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePermission("students.read");
  const query = studentListQuerySchema.parse(await searchParams);
  const result = await listStudents(ctx, query);
  const classes = result.year && canSchoolWide(ctx, "students.read") ? await listClasses(ctx.db, ctx.school.id, result.year.id) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Élèves"
        description="Dossiers, inscriptions, affectations et historique scolaire."
        actions={
          <>
            {can(ctx, "students.export") && canSchoolWide(ctx, "students.read") && (
              <Button asChild variant="outline">
                <a href="/api/export/students" download>
                  <DownloadIcon /> Exporter
                </a>
              </Button>
            )}
            {can(ctx, "students.create") && (
              <>
                <Button asChild variant="outline">
                  <Link href="/app/students/import">
                    <UploadIcon /> Importer
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/app/students/new">
                    <UserPlusIcon /> Nouvel élève
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <Card className="p-3 sm:p-4">
        <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
          <label className="relative">
            <span className="sr-only">Rechercher</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={query.q} placeholder="Nom, prénom ou matricule…" className="pl-9" />
          </label>
          {classes.length > 0 && (
            <Select name="class" defaultValue={query.class ?? ""} aria-label="Classe">
              <option value="">Toutes les classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Select name="status" defaultValue={query.status} aria-label="Statut">
            <option value="active">Actifs</option>
            <option value="applicant">Candidats</option>
            <option value="transferred">Transférés</option>
            <option value="withdrawn">Partis</option>
            <option value="graduated">Diplômés</option>
            <option value="archived">Archivés</option>
            <option value="all">Tous</option>
          </Select>
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
        </form>
        {canSchoolWide(ctx, "students.read") && (
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <Link
              href={query.filter === "incomplete" ? "/app/students" : "/app/students?filter=incomplete"}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-muted-foreground transition-colors hover:bg-muted"
              aria-pressed={query.filter === "incomplete"}
            >
              <FileWarningIcon className="size-3.5" aria-hidden /> Dossiers incomplets
            </Link>
          </div>
        )}
      </Card>

      {query.filter === "incomplete" ? (
        <Card>
          {result.incomplete.length ? (
            <ul className="divide-y">
              {result.incomplete.map((s) => (
                <li key={s.student_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/app/students/${s.student_id}`} className="font-medium hover:text-primary">
                    {fullName(s)} <span className="text-xs text-muted-foreground">· {s.matricule}</span>
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {(s.missing ?? []).map((m) => (
                      <Badge key={m} variant="warning">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={FileWarningIcon} title="Tous les dossiers sont complets" className="m-4" />
          )}
        </Card>
      ) : result.rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={query.q ? "Aucun élève ne correspond à la recherche" : "Aucun élève"}
          description={query.q ? "Essayez avec un autre nom ou matricule." : "Inscrivez un élève ou importez une liste au format CSV."}
        />
      ) : (
        <Card className="overflow-hidden">
          {/* Phones: cards */}
          <ul className="divide-y sm:hidden">
            {result.rows.map((s) => (
              <li key={s.id}>
                <Link href={`/app/students/${s.id}`} className="flex items-center gap-3 p-3 active:bg-muted">
                  <Avatar name={fullName(s)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{fullName(s)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.matricule} · {s.className ?? "Non affecté"}
                    </p>
                  </div>
                  {s.status !== "active" && <Badge variant="muted">{STUDENT_STATUS_LABELS[s.status]}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
          {/* Tablets and desktop: table */}
          <div className="hidden sm:block">
            <Table>
              <THead>
                <TR>
                  <TH>Élève</TH>
                  <TH>Matricule</TH>
                  <TH>Classe</TH>
                  <TH>Naissance</TH>
                  <TH>Statut</TH>
                </TR>
              </THead>
              <TBody>
                {result.rows.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/app/students/${s.id}`} className="flex items-center gap-3 font-medium hover:text-primary">
                        <Avatar name={fullName(s)} className="size-8" />
                        {fullName(s)}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{s.matricule}</TD>
                    <TD>{s.className ?? <span className="text-muted-foreground">Non affecté</span>}</TD>
                    <TD>{formatDate(s.birth_date)}</TD>
                    <TD>
                      <Badge variant={s.status === "active" ? "default" : "muted"}>{STUDENT_STATUS_LABELS[s.status] ?? s.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="border-t px-4 pb-4">
            <Pagination
              page={query.page}
              pageSize={STUDENTS_PAGE_SIZE}
              total={result.total}
              basePath="/app/students"
              params={{ q: query.q, class: query.class, status: query.status }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
