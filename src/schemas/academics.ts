import { z } from "zod";
import { isoDateSchema } from "./students";

const uuidOrEmpty = z.uuid().optional().or(z.literal("").transform(() => undefined));

export const yearSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().regex(/^\d{4}-\d{4}$/, "Format attendu : 2026-2027"),
    starts_on: isoDateSchema,
    ends_on: isoDateSchema,
    is_current: z.coerce.boolean().default(false),
    terms: z.coerce.number().int().min(1).max(6).default(3),
  })
  .refine((v) => v.ends_on > v.starts_on, { path: ["ends_on"], message: "La fin doit suivre le début" });

export const termSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(2).max(60),
    starts_on: isoDateSchema,
    ends_on: isoDateSchema,
    weight: z.coerce.number().positive().max(10).default(1),
  })
  .refine((v) => v.ends_on > v.starts_on, { path: ["ends_on"], message: "La fin doit suivre le début" });

export const levelSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  short_name: z.string().trim().max(12).optional(),
  cycle_name: z.string().trim().max(60).optional(),
  position: z.coerce.number().int().min(1).max(50).default(1),
});

export const subjectSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,16}$/, "Code : lettres, chiffres, - ou _"),
  name: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal("").transform(() => undefined)),
});

export const roomSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
  building: z.string().trim().max(60).optional(),
  capacity: z.coerce.number().int().min(1).max(2000).optional().or(z.literal("").transform(() => undefined)),
});

export const classSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(40),
  level_id: z.uuid("Niveau requis"),
  capacity: z.coerce.number().int().min(1).max(200),
  room_id: uuidOrEmpty,
  homeroom_staff_id: uuidOrEmpty,
});

export const classSubjectSchema = z.object({
  id: z.uuid().optional(),
  class_id: z.uuid(),
  subject_id: z.uuid("Matière requise"),
  teacher_id: uuidOrEmpty,
  coefficient: z.coerce.number().positive().max(20),
  weekly_hours: z.coerce.number().min(0).max(40).optional().or(z.literal("").transform(() => undefined)),
});

export const bellPeriodSchema = z
  .object({
    label: z.string().trim().min(1).max(30),
    starts_at: z.string().regex(/^\d{2}:\d{2}$/),
    ends_at: z.string().regex(/^\d{2}:\d{2}$/),
    is_break: z.coerce.boolean().default(false),
  })
  .refine((v) => v.ends_at > v.starts_at, { path: ["ends_at"], message: "Fin avant début" });
