import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Alert, PageHeader } from "@/components/ui/misc";
import { RollCall } from "@/features/attendance/roll-call";
import { formatDate, isoDate } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { rollCallContext } from "@/server/services/attendance";

export const metadata: Metadata = { title: "Faire l'appel" };

const querySchema = z.object({
  class: z.uuid(),
  entry: z.uuid().optional().catch(undefined),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export default async function TakeAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePermission("attendance.create");
  const parsed = querySchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const date = parsed.data.date && parsed.data.date <= isoDate() ? parsed.data.date : isoDate();
  const data = await rollCallContext(ctx, parsed.data.class, date, parsed.data.entry).catch(() => null);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        eyebrow="Appel"
        title={data.cls.name}
        description={`${formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${
          data.entry ? ` · ${data.entry.cs?.subject?.name ?? ""} ${data.entry.starts_at.slice(0, 5)}–${data.entry.ends_at.slice(0, 5)}` : " · appel journalier"
        }`}
      />
      {data.takenAt && <Alert tone="info">Un appel existe déjà pour ce créneau : vos modifications le mettront à jour (historique conservé).</Alert>}
      <RollCall
        classId={data.cls.id}
        date={date}
        entryId={parsed.data.entry}
        students={data.students}
        existing={data.existing}
        justified={[...data.justified]}
      />
    </div>
  );
}
