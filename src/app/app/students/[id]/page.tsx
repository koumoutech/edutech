import {
  CalendarCheckIcon,
  FileTextIcon,
  HeartPulseIcon,
  PencilIcon,
  PhoneIcon,
  ShieldAlertIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/features/documents/document-upload";
import { AddGuardianButton, ArchiveButton, EnrollButton, UnlinkGuardianButton, WithdrawButton } from "@/features/students/detail-actions";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDate, formatMoney, fullName } from "@/lib/utils";
import { RELATIONSHIP_LABELS, STUDENT_STATUS_LABELS } from "@/schemas/students";
import { requirePermission } from "@/server/auth/session";
import { getCurrentYear, listClasses } from "@/server/repositories/academic";
import { getStudent } from "@/server/services/students";

export const metadata: Metadata = { title: "Dossier élève" };

const ENROLLMENT_STATUS: Record<string, string> = {
  pending: "En attente",
  active: "Active",
  transferred: "Changement / transfert",
  completed: "Terminée",
  withdrawn: "Départ",
};

const INVOICE_STATUS: Record<string, { label: string; variant: "default" | "warning" | "danger" | "muted" | "solid" }> = {
  draft: { label: "Brouillon", variant: "muted" },
  issued: { label: "Émise", variant: "warning" },
  partially_paid: { label: "Partielle", variant: "warning" },
  paid: { label: "Payée", variant: "default" },
  cancelled: { label: "Annulée", variant: "muted" },
};

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("students.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getStudent(ctx, id).catch(() => null);
  if (!data) notFound();
  const { student: s, enrollments, guardians, health, documents, docTypes, attendance, invoices } = data;
  const year = await getCurrentYear(ctx.db, ctx.school.id);
  const current = enrollments.find((e) => e.status === "active" && e.academic_year_id === year?.id);
  const classes = can(ctx, "enrollments.manage") && year ? await listClasses(ctx.db, ctx.school.id, year.id) : [];
  const manage = canSchoolWide(ctx, "students.update");
  const missingDocs = docTypes.filter((t) => t.is_mandatory && !documents.some((d) => d.document_type_id === t.id));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Matricule ${s.matricule}`}
        title={fullName(s)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={s.status === "active" ? "default" : "muted"}>{STUDENT_STATUS_LABELS[s.status] ?? s.status}</Badge>
            {current?.class ? <span>{current.class.name}</span> : <span>Non affecté pour l&apos;année en cours</span>}
            {s.birth_date && <span>· Né(e) le {formatDate(s.birth_date)}</span>}
          </span>
        }
        actions={
          <>
            {manage && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/students/${s.id}/edit`}>
                  <PencilIcon /> Modifier
                </Link>
              </Button>
            )}
            {can(ctx, "enrollments.manage") && s.status !== "archived" && (
              <>
                <EnrollButton studentId={s.id} classes={classes.map((c) => ({ id: c.id, name: c.name }))} currentClassId={current?.class?.id ?? null} />
                {current && <WithdrawButton studentId={s.id} />}
              </>
            )}
            {can(ctx, "students.delete") && s.status !== "archived" && <ArchiveButton studentId={s.id} />}
          </>
        }
      />

      {manage && missingDocs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-highlight/50 bg-highlight/10 px-4 py-3 text-sm">
          <ShieldAlertIcon className="size-4 text-[#a37800] dark:text-highlight" aria-hidden />
          <span className="font-medium">Dossier incomplet :</span>
          {missingDocs.map((d) => (
            <Badge key={d.id} variant="warning">
              {d.name}
            </Badge>
          ))}
        </div>
      )}

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="schooling">Scolarité</TabsTrigger>
          <TabsTrigger value="attendance">Présences</TabsTrigger>
          {can(ctx, "documents.read") && <TabsTrigger value="documents">Documents</TabsTrigger>}
          {can(ctx, "finance.read") && <TabsTrigger value="finance">Finances</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Informations personnelles</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {[
                  ["Sexe", s.gender === "F" ? "Féminin" : s.gender === "M" ? "Masculin" : "—"],
                  ["Lieu de naissance", s.birth_place],
                  ["Nationalité", s.nationality],
                  ["Adresse", s.address],
                  ["Téléphone", s.phone],
                  ["E-mail", s.email],
                  ["Admission", formatDate(s.admission_date)],
                  ["Établissement précédent", s.previous_school],
                ].map(([k, v]) => (
                  <div key={k as string} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-words">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
              {s.notes && <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">{s.notes}</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Responsables légaux et contacts</CardTitle>
              {can(ctx, "guardians.manage") && <AddGuardianButton studentId={s.id} />}
            </CardHeader>
            <CardContent className="space-y-3">
              {guardians.length === 0 && <p className="text-sm text-muted-foreground">Aucun responsable rattaché.</p>}
              {guardians.map((g) => (
                <div key={g.guardian?.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <Avatar name={fullName(g.guardian)} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">
                      {fullName(g.guardian)} <span className="font-normal text-muted-foreground">· {RELATIONSHIP_LABELS[g.relationship as keyof typeof RELATIONSHIP_LABELS] ?? g.relationship}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {g.guardian?.phone && (
                        <a href={`tel:${g.guardian.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                          <PhoneIcon className="size-3" aria-hidden /> {g.guardian.phone}
                        </a>
                      )}
                      {g.guardian?.email && <span className="ml-2">{g.guardian.email}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.is_emergency_contact && <Badge variant="warning">Urgence</Badge>}
                      {g.is_billing_contact && <Badge variant="muted">Facturation</Badge>}
                      {g.guardian?.user_id ? <Badge>Compte parent actif</Badge> : <Badge variant="outline">Sans compte</Badge>}
                    </div>
                  </div>
                  {can(ctx, "guardians.manage") && g.guardian && <UnlinkGuardianButton studentId={s.id} guardianId={g.guardian.id} name={fullName(g.guardian)} />}
                </div>
              ))}
              {s.emergency_contacts?.length > 0 && (
                <div className="pt-2">
                  <p className="mb-2 text-sm font-semibold">Autres contacts d&apos;urgence</p>
                  <ul className="space-y-1 text-sm">
                    {s.emergency_contacts.map((c) => (
                      <li key={c.id}>
                        {c.full_name} ({c.relationship ?? "—"}) — {c.phone}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {can(ctx, "health.read") && (
            <Card className="lg:col-span-3">
              <CardHeader className="flex-row items-center gap-2">
                <HeartPulseIcon className="size-5 text-destructive" aria-hidden />
                <CardTitle>Informations médicales (confidentiel)</CardTitle>
              </CardHeader>
              <CardContent>
                {health ? (
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Groupe sanguin</dt>
                      <dd>{health.blood_group || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Allergies</dt>
                      <dd>{health.allergies || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Traitements</dt>
                      <dd>{health.medications || "—"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune information médicale renseignée.</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="schooling">
          <Card>
            <CardHeader>
              <CardTitle>Historique scolaire</CardTitle>
            </CardHeader>
            <CardContent>
              {enrollments.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Année</TH>
                      <TH>Classe</TH>
                      <TH>Type</TH>
                      <TH>Du</TH>
                      <TH>Au</TH>
                      <TH>Statut</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {enrollments.map((e) => (
                      <TR key={e.id}>
                        <TD>{e.year?.name}</TD>
                        <TD>{e.class?.name ?? "—"}</TD>
                        <TD>{e.kind === "new" ? "Inscription" : e.kind === "re_enrollment" ? "Réinscription" : "Transfert"}</TD>
                        <TD>{formatDate(e.enrolled_on)}</TD>
                        <TD>{formatDate(e.left_on)}</TD>
                        <TD>
                          <Badge variant={e.status === "active" ? "default" : "muted"}>{ENROLLMENT_STATUS[e.status] ?? e.status}</Badge>
                          {e.leave_reason && <p className="mt-1 text-xs text-muted-foreground">{e.leave_reason}</p>}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune inscription enregistrée.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/report-cards?student=${s.id}`}>Bulletins</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/assessments/student/${s.id}`}>Notes</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Pointages", attendance.total],
              ["Absences non justifiées", attendance.absent],
              ["Absences justifiées", attendance.excused],
              ["Retards", attendance.late],
            ].map(([label, value]) => (
              <Card key={label as string} className="p-4">
                <CalendarCheckIcon className="mb-2 size-5 text-primary" aria-hidden />
                <p className="text-2xl font-bold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        {can(ctx, "documents.read") && (
          <TabsContent value="documents" className="space-y-4">
            {can(ctx, "documents.create") && <DocumentUpload studentId={s.id} documentTypes={docTypes.map((d) => ({ id: d.id, name: d.name }))} />}
            <Card>
              <CardContent className="pt-5">
                {documents.length ? (
                  <ul className="divide-y">
                    {documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                        <FileTextIcon className="size-4 text-primary" aria-hidden />
                        <span className="flex-1">{d.title}</span>
                        {d.visible_to_family && <Badge variant="muted">Visible famille</Badge>}
                        <span className="text-xs text-muted-foreground">{formatDate(d.created_at)}</span>
                        {d.storage_path ? (
                          <Button asChild variant="ghost" size="sm">
                            <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                              Ouvrir
                            </a>
                          </Button>
                        ) : (
                          <Badge variant="outline">Pièce enregistrée</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={FileTextIcon} title="Aucun document" className="py-8" />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {can(ctx, "finance.read") && (
          <TabsContent value="finance">
            <Card>
              <CardContent className="pt-5">
                {invoices.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Facture</TH>
                        <TH>Échéance</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Payé</TH>
                        <TH className="text-right">Reste dû</TH>
                        <TH>Statut</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {invoices.map((i) => (
                        <TR key={i.id}>
                          <TD>
                            <Link href={`/app/finance/invoices/${i.id}`} className="font-medium hover:text-primary">
                              {i.number}
                            </Link>
                          </TD>
                          <TD>{formatDate(i.due_date)}</TD>
                          <TD className="text-right tabular-nums">{formatMoney(i.total, ctx.school.currency)}</TD>
                          <TD className="text-right tabular-nums">{formatMoney(i.amount_paid, ctx.school.currency)}</TD>
                          <TD className="text-right font-semibold tabular-nums">{formatMoney(i.balance, ctx.school.currency)}</TD>
                          <TD>
                            <Badge variant={INVOICE_STATUS[i.status]?.variant ?? "muted"}>{INVOICE_STATUS[i.status]?.label ?? i.status}</Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <EmptyState icon={WalletIcon} title="Aucune facture" className="py-8" />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
