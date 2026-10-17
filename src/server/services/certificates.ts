import "server-only";
import { z } from "zod";
import { renderTemplate, unknownPlaceholders } from "@/features/documents/template";
import { formatDate, fullName } from "@/lib/utils";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrapList } from "@/server/errors";
import { certificatePdf } from "@/server/pdf/documents";
import { getCurrentYear } from "@/server/repositories/academic";
import { storeDocument } from "@/server/services/documents";
import { schoolHeader } from "@/server/services/school";

export const generateSchema = z.object({
  template_id: z.uuid(),
  student_id: z.uuid(),
  custom_message: z.string().trim().max(2000).optional(),
  visible_to_family: z.literal("on").optional(),
});

export const templateSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum([
    "enrollment_certificate",
    "attendance_certificate",
    "attestation",
    "convocation",
    "transfer_certificate",
    "receipt",
    "report_card",
    "custom",
  ]),
  name: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(10).max(20000),
});

export async function listTemplates(ctx: AppContext) {
  return unwrapList(
    await ctx.db
      .from("document_templates")
      .select("id, kind, name, title, body, is_active, updated_at")
      .eq("school_id", ctx.school.id)
      .order("name"),
  );
}

export async function saveTemplate(ctx: AppContext, input: z.infer<typeof templateSchema>) {
  assertCan(ctx, "templates.manage", ["school"]);
  const unknown = unknownPlaceholders(input.body);
  if (unknown.length)
    throw new AppError("VALIDATION", `Champs inconnus dans le modèle : ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
  const row = {
    kind: input.kind,
    name: input.name,
    title: input.title,
    body: input.body,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await ctx.db.from("document_templates").update(row).eq("id", input.id)
    : await ctx.db.from("document_templates").insert({ ...row, school_id: ctx.school.id });
  if (error) throw fromDbError(error);
}

/** Renders a template for a student, produces the PDF, stores it in the student's file. */
export async function generateCertificate(ctx: AppContext, input: z.infer<typeof generateSchema>) {
  assertCan(ctx, "documents.create", ["school"]);
  const db = ctx.db;
  const [{ data: tpl }, { data: student }, year, school] = await Promise.all([
    db.from("document_templates").select("id, kind, title, body").eq("id", input.template_id).maybeSingle(),
    db
      .from("students")
      .select("id, first_name, last_name, matricule, birth_date, birth_place")
      .eq("id", input.student_id)
      .maybeSingle(),
    getCurrentYear(db, ctx.school.id),
    schoolHeader(ctx),
  ]);
  if (!tpl || !student) throw new AppError("NOT_FOUND");
  const { data: enr } = year
    ? await db
        .from("enrollments")
        .select("class:classes!enrollments_school_id_class_id_fkey(name)")
        .eq("student_id", student.id)
        .eq("academic_year_id", year.id)
        .order("enrolled_on", { ascending: false })
        .limit(1)
    : { data: [] };
  const { count: absences } = await db
    .from("attendance_records")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.id)
    .in("status", ["absent", "excused"]);
  const { data: signatory } = await db
    .from("staff_members")
    .select("first_name, last_name, job_title")
    .eq("school_id", ctx.school.id)
    .ilike("job_title", "direct%")
    .limit(1);

  const body = renderTemplate(tpl.body, {
    school_name: school.name,
    school_city: school.city,
    signatory_name: signatory?.[0] ? fullName(signatory[0]) : "Le chef d'établissement",
    signatory_title: signatory?.[0]?.job_title ?? "chef d'établissement",
    student_full_name: fullName(student),
    student_first_name: student.first_name,
    student_last_name: student.last_name.toUpperCase(),
    student_birth_date: formatDate(student.birth_date, { day: "numeric", month: "long", year: "numeric" }),
    student_birth_place: student.birth_place,
    student_matricule: student.matricule,
    class_name: enr?.[0]?.class?.name,
    academic_year: year?.name,
    absences_count: absences ?? 0,
    today: formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" }),
    custom_message: input.custom_message,
  });
  const reference = `${tpl.kind.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const bytes = await certificatePdf(school, {
    title: tpl.title,
    body,
    signatory: signatory?.[0] ? `${fullName(signatory[0])}, ${signatory[0].job_title}` : "Le chef d'établissement",
    reference,
  });
  const id = await storeDocument(ctx, {
    file: { name: `${tpl.title}-${student.last_name}.pdf`, bytes },
    title: `${tpl.title} — ${reference}`,
    category: "certificate",
    studentId: student.id,
    visibleToFamily: Boolean(input.visible_to_family),
  });
  return { id };
}

export async function recentDocuments(ctx: AppContext) {
  assertCan(ctx, "documents.read");
  return unwrapList(
    await ctx.db
      .from("documents")
      .select(
        "id, title, category, created_at, storage_path, visible_to_family, student:students!documents_school_id_student_id_fkey(id, first_name, last_name)",
      )
      .eq("school_id", ctx.school.id)
      .is("deleted_at", null)
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
  );
}
