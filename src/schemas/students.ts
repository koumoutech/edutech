import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ)");

export const genderSchema = z.enum(["F", "M", "X"]);
export const relationshipSchema = z.enum(["mother", "father", "tutor", "grandparent", "sibling", "other"]);

export const studentFieldsSchema = z.object({
  matricule: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,32}$/, "3 à 32 caractères : lettres, chiffres, tirets")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  first_name: z.string().trim().min(1, "Prénom requis").max(80),
  last_name: z.string().trim().min(1, "Nom requis").max(80),
  gender: genderSchema.optional().or(z.literal("").transform(() => undefined)),
  birth_date: isoDateSchema.optional().or(z.literal("").transform(() => undefined)),
  birth_place: optionalText(120),
  nationality: optionalText(80),
  address: optionalText(300),
  phone: optionalText(40),
  email: z.email("E-mail invalide").max(254).optional().or(z.literal("").transform(() => undefined)),
  previous_school: optionalText(160),
  notes: optionalText(2000),
});

export const guardianFieldsSchema = z.object({
  id: z.uuid().optional(),
  first_name: z.string().trim().min(1, "Prénom du responsable requis").max(80),
  last_name: z.string().trim().min(1, "Nom du responsable requis").max(80),
  phone: optionalText(40),
  email: z.email("E-mail invalide").max(254).optional().or(z.literal("").transform(() => undefined)),
  profession: optionalText(120),
  relationship: relationshipSchema.default("other"),
  is_emergency_contact: z.coerce.boolean().default(true),
  is_billing_contact: z.coerce.boolean().default(false),
});

export const createStudentSchema = z.object({
  student: studentFieldsSchema,
  guardians: z.array(guardianFieldsSchema).max(4).default([]),
  academic_year_id: z.uuid().optional(),
  class_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
});

export const updateStudentSchema = studentFieldsSchema.extend({ id: z.uuid() });

export const studentListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  class: z.uuid().optional().catch(undefined),
  status: z.enum(["active", "applicant", "transferred", "graduated", "withdrawn", "archived", "all"]).catch("active").default("active"),
  page: z.coerce.number().int().min(1).max(10000).catch(1).default(1),
  filter: z.enum(["incomplete"]).optional().catch(undefined),
});

export const RELATIONSHIP_LABELS: Record<z.infer<typeof relationshipSchema>, string> = {
  mother: "Mère",
  father: "Père",
  tutor: "Tuteur / tutrice",
  grandparent: "Grand-parent",
  sibling: "Frère / sœur",
  other: "Autre",
};

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  applicant: "Candidat",
  active: "Actif",
  transferred: "Transféré",
  graduated: "Diplômé",
  withdrawn: "Parti",
  archived: "Archivé",
};
