import { FileBadgeIcon, FileDownIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { generateReportCardsAction } from "@/features/grades/actions";
import { REPORT_CARD_STATUS } from "@/features/grades/labels";
import { ReportCardTable } from "@/features/grades/report-card-bulk";
import { can, canSchoolWide, isFamilyOnly } from "@/lib/authz";
import { formatScore, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { listClasses } from "@/server/repositories/academic";
import { assessmentFrame, listReportCards } from "@/server/services/assessments";

export const metadata: Metadata = { title: "Bulletins" };

const query = z.object({
  class: z.uuid().optional().catch(undefined),
  term: z.uuid().optional().catch(undefined),
  student: z.uuid().optional().catch(undefined),
});

export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("report_cards.read");
  const q = query.parse(await searchParams);
  const frame = await assessmentFrame(ctx);

  // Families and single-student views: list of published report cards.
  if (isFamilyOnly(ctx.school.roles) || q.student) {
    const cards = await listReportCards(ctx, { studentId: q.student });
    return (
      <div className="space-y-5">
        <PageHeader title="Bulletins" description="Bulletins publiés par l'établissement, téléchargeables en PDF." />
        {cards.length === 0 ? (
          <EmptyState
            icon={FileBadgeIcon}
            title="Aucun bulletin disponible"
            description="Les bulletins apparaissent ici dès leur publication."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) => (
              <Card key={c.id} className="flex items-center gap-4 p-4">
                <div className="bg-brand-soft text-primary dark:bg-secondary flex size-12 items-center justify-center rounded-xl">
                  <FileBadgeIcon aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {c.term?.name} · {fullName(c.student)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Moyenne {formatScore(c.average === null ? null : Number(c.average))}/20
                    {c.rank ? ` · rang ${c.rank}/${c.class_size}` : ""} · {c.class?.name}
                  </p>
                  {!isFamilyOnly(ctx.school.roles) && (
                    <Badge variant={REPORT_CARD_STATUS[c.status]?.variant}>{REPORT_CARD_STATUS[c.status]?.label}</Badge>
                  )}
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/report-cards/${c.id}`} target="_blank" rel="noopener">
                    <FileDownIcon /> PDF
                  </a>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const classes = frame.year ? await listClasses(ctx.db, ctx.school.id, frame.year.id) : [];
  const classId = q.class ?? classes[0]?.id;
  const termId = q.term ?? frame.currentTerm?.id;
  const cards = classId && termId ? await listReportCards(ctx, { classId, termId }) : [];
  const canGenerate = canSchoolWide(ctx, "report_cards.create");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bulletins"
        description="Calcul automatique des moyennes et rangs selon le barème de l'établissement, puis validation et publication."
        actions={
          canGenerate &&
          classId &&
          termId && (
            <FormDialog
              title="Générer les bulletins"
              action={generateReportCardsAction}
              triggerLabel="Générer / recalculer"
              submitLabel="Générer"
            >
              <p className="text-muted-foreground text-sm">
                Les moyennes sont calculées à partir des évaluations <strong>validées ou publiées</strong>. Les
                bulletins déjà validés ne sont pas recalculés.
              </p>
              <Field label="Classe" htmlFor="g-class">
                <Select id="g-class" name="class_id" defaultValue={classId}>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Période" htmlFor="g-term">
                <Select id="g-term" name="term_id" defaultValue={termId}>
                  {frame.terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormDialog>
          )
        }
      />
      <Card className="p-3">
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Select name="class" defaultValue={classId} aria-label="Classe">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="term" defaultValue={termId} aria-label="Période">
            {frame.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Afficher
          </Button>
        </form>
      </Card>
      {cards.length === 0 ? (
        <EmptyState
          icon={SparklesIcon}
          title="Aucun bulletin pour cette classe et cette période"
          description={canGenerate ? "Validez les évaluations puis générez les bulletins." : undefined}
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap gap-6 pt-5 text-sm">
              <p>
                Moyenne de classe :{" "}
                <strong>
                  {formatScore(cards[0].class_average === null ? null : Number(cards[0].class_average))}/20
                </strong>
              </p>
              <p>
                Réussite :{" "}
                <strong>
                  {cards.filter((c) => c.average !== null && Number(c.average) >= 10).length}/{cards.length}
                </strong>
              </p>
              <p>
                Publiés : <strong>{cards.filter((c) => c.status === "published").length}</strong>
              </p>
            </CardContent>
          </Card>
          <ReportCardTable
            cards={cards.map((c) => ({
              id: c.id,
              studentId: c.student?.id ?? "",
              name: fullName(c.student),
              average: c.average === null ? null : Number(c.average),
              rank: c.rank,
              classSize: c.class_size,
              mention: c.mention,
              status: c.status,
            }))}
            canValidate={canSchoolWide(ctx, "report_cards.validate")}
            canPublish={canSchoolWide(ctx, "report_cards.publish")}
          />
        </>
      )}
      {!can(ctx, "report_cards.create") && (
        <p className="text-muted-foreground text-xs">
          Consultez la fiche d&apos;un élève pour ses bulletins.{" "}
          <Link href="/app/students" className="underline">
            Liste des élèves
          </Link>
        </p>
      )}
    </div>
  );
}
