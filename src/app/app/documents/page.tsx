import { FileTextIcon, ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { generateCertificateAction, saveTemplateAction } from "@/features/documents/actions";
import { TEMPLATE_PLACEHOLDERS } from "@/features/documents/template";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { formatDateTime, fullName } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { listTemplates, recentDocuments } from "@/server/services/certificates";

export const metadata: Metadata = { title: "Documents" };

const KINDS: Record<string, string> = {
  enrollment_certificate: "Certificat de scolarité",
  attendance_certificate: "Attestation d'assiduité",
  attestation: "Attestation",
  convocation: "Convocation",
  transfer_certificate: "Certificat de radiation",
  receipt: "Reçu",
  report_card: "Bulletin",
  custom: "Personnalisé",
};

export default async function DocumentsPage() {
  const ctx = await requireContext();
  if (!can(ctx, "documents.read") && !can(ctx, "documents.create")) redirect("/app/forbidden");

  if (isFamilyOnly(ctx.school.roles)) {
    const { data } = await ctx.db
      .from("documents")
      .select("id, title, created_at, student:students!documents_school_id_student_id_fkey(first_name, last_name)")
      .is("deleted_at", null)
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    return (
      <div className="space-y-5">
        <PageHeader
          title="Documents"
          description="Documents partagés par l'établissement (certificats, attestations…)."
        />
        {(data ?? []).length === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title="Aucun document partagé"
            description="Pour obtenir un certificat, faites une demande administrative."
            action={
              <Button asChild>
                <Link href="/app/requests">Faire une demande</Link>
              </Button>
            }
          />
        ) : (
          <Card className="divide-y">
            {(data ?? []).map((d) => (
              <div key={d.id} className="flex items-center gap-3 p-4 text-sm">
                <FileTextIcon className="text-primary size-4" aria-hidden />
                <span className="flex-1">
                  {d.title} <span className="text-muted-foreground">· {fullName(d.student)}</span>
                </span>
                <a
                  href={`/api/documents/${d.id}`}
                  target="_blank"
                  rel="noopener"
                  className="text-primary font-medium hover:underline"
                >
                  Ouvrir
                </a>
              </div>
            ))}
          </Card>
        )}
      </div>
    );
  }

  const [templates, docs, students] = await Promise.all([
    listTemplates(ctx),
    can(ctx, "documents.read") ? recentDocuments(ctx) : [],
    canSchoolWide(ctx, "documents.create")
      ? ctx.db
          .from("students")
          .select("id, first_name, last_name, matricule")
          .eq("school_id", ctx.school.id)
          .eq("status", "active")
          .order("last_name")
          .limit(2000)
      : null,
  ]);
  const canGenerate = canSchoolWide(ctx, "documents.create") && templates.length > 0;
  const manageTemplates = canSchoolWide(ctx, "templates.manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Certificats, attestations et convocations générés en PDF à partir de modèles personnalisables."
        actions={
          canGenerate && (
            <FormDialog
              title="Générer un document"
              action={generateCertificateAction}
              triggerLabel="Générer un document"
              submitLabel="Générer le PDF"
            >
              <Field label="Modèle" htmlFor="g-tpl">
                <Select id="g-tpl" name="template_id" required>
                  {templates
                    .filter((t) => t.is_active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Élève" htmlFor="g-student">
                <Select id="g-student" name="student_id" required defaultValue="">
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {(students?.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {fullName(s)} — {s.matricule}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Message libre (convocations)" htmlFor="g-msg">
                <Textarea id="g-msg" name="custom_message" rows={3} maxLength={2000} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="visible_to_family"
                  defaultChecked
                  className="size-4 accent-[var(--primary)]"
                />{" "}
                Partager avec la famille
              </label>
            </FormDialog>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Documents récents</CardTitle>
          </CardHeader>
          <CardContent>
            {docs.length === 0 ? (
              <EmptyState icon={FileTextIcon} title="Aucun document" className="py-8" />
            ) : (
              <ul className="divide-y text-sm">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <FileTextIcon className="text-primary size-4" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{d.title}</span>
                      {d.student && (
                        <Link
                          href={`/app/students/${d.student.id}`}
                          className="text-muted-foreground hover:text-primary block text-xs"
                        >
                          {fullName(d.student)}
                        </Link>
                      )}
                    </span>
                    {d.visible_to_family && <Badge variant="muted">Partagé</Badge>}
                    <span className="text-muted-foreground text-xs">{formatDateTime(d.created_at)}</span>
                    <a
                      href={`/api/documents/${d.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-primary font-medium hover:underline"
                    >
                      Ouvrir
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Modèles</CardTitle>
            {manageTemplates && (
              <FormDialog title="Nouveau modèle" action={saveTemplateAction} triggerLabel="Nouveau">
                <TemplateFields />
              </FormDialog>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <ScrollTextIcon className="text-primary size-4" aria-hidden />
                  <span className="flex-1">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground block text-xs">{KINDS[t.kind]}</span>
                  </span>
                  {manageTemplates && (
                    <FormDialog
                      title={`Modifier — ${t.name}`}
                      action={saveTemplateAction}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Modifier
                        </Button>
                      }
                    >
                      <TemplateFields t={t} />
                    </FormDialog>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TemplateFields({ t }: { t?: { id: string; kind: string; name: string; title: string; body: string } }) {
  return (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom" htmlFor={`tp-name-${t?.id ?? "new"}`}>
          <Input id={`tp-name-${t?.id ?? "new"}`} name="name" defaultValue={t?.name} required />
        </Field>
        <Field label="Type" htmlFor={`tp-kind-${t?.id ?? "new"}`}>
          <Select id={`tp-kind-${t?.id ?? "new"}`} name="kind" defaultValue={t?.kind ?? "attestation"}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Titre du document" htmlFor={`tp-title-${t?.id ?? "new"}`}>
        <Input id={`tp-title-${t?.id ?? "new"}`} name="title" defaultValue={t?.title} required />
      </Field>
      <Field
        label="Texte"
        htmlFor={`tp-body-${t?.id ?? "new"}`}
        hint="Champs disponibles ci-dessous, à écrire entre doubles accolades."
      >
        <Textarea id={`tp-body-${t?.id ?? "new"}`} name="body" defaultValue={t?.body} rows={8} required />
      </Field>
      <div className="flex flex-wrap gap-1">
        {Object.entries(TEMPLATE_PLACEHOLDERS).map(([k, v]) => (
          <code key={k} title={v} className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
            {`{{${k}}}`}
          </code>
        ))}
      </div>
    </>
  );
}
