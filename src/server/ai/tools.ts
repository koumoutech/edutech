import "server-only";
import { z } from "zod";
import { can, canSchoolWide, type Permission } from "@/lib/authz";
import { isoDate } from "@/lib/utils";
import { buildNavigation } from "@/features/navigation/nav";
import type { AppContext } from "@/server/auth/session";
import { unwrapList } from "@/server/errors";
import { loadAcademicFrame, managementAlerts } from "@/server/services/dashboard";

/**
 * Business tools exposed to the AI assistant.
 *
 * Security model:
 * - The model never builds queries. It can only call these functions, with
 *   inputs validated by a strict JSON schema AND a zod schema.
 * - Each tool declares an authorization check evaluated against the caller's
 *   permissions for the active school. Tools the user cannot use are not even
 *   offered to the model, and are re-checked on execution (defence in depth).
 * - All reads go through the user's own Supabase client, so Row Level Security
 *   restricts data to the user's scope (e.g. a teacher only sees their classes).
 * - Results contain the minimum fields needed. Students are referenced by an
 *   opaque token `[[eleve:<uuid>]]`; names are added only when the platform
 *   explicitly allows personal data to be sent to the AI provider. The UI
 *   resolves tokens back to names with the user's own permissions.
 * - Tools never write. Drafts are returned as proposals that the user must
 *   confirm; the confirmation goes through the normal service layer.
 */

export interface ToolRuntime {
  ctx: AppContext;
  allowPersonalData: boolean;
  /** Proposals collected during the turn (e.g. an announcement draft awaiting confirmation). */
  proposals: AssistantProposal[];
}

export interface AnnouncementProposal {
  kind: "announcement_draft";
  title: string;
  body: string;
  priority: "normal" | "important" | "urgent";
}
export type AssistantProposal = AnnouncementProposal;

export interface ToolOutput {
  data: unknown;
  /** Number of records returned, kept in the audit log (the data itself is not). */
  count?: number;
}

interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
  [key: string]: unknown;
}

export interface AssistantTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  input: S;
  /** Authorization check, evaluated server-side for every call. */
  allowed: (ctx: AppContext) => boolean;
  run: (rt: ToolRuntime, input: z.infer<S>) => Promise<ToolOutput>;
}

function defineTool<S extends z.ZodType>(tool: AssistantTool<S>): AssistantTool<S> {
  return tool;
}

const noInput = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const satisfies JsonSchemaObject;

export function studentRef(id: string): string {
  return `[[eleve:${id}]]`;
}

function student(rt: ToolRuntime, row: { student_id: string; first_name?: string | null; last_name?: string | null }) {
  const base = { ref: studentRef(row.student_id) };
  return rt.allowPersonalData ? { ...base, name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() } : base;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

const anyOf =
  (...perms: Permission[]) =>
  (ctx: AppContext) =>
    perms.some((p) => can(ctx, p));

export const TOOLS = [
  defineTool({
    name: "list_pending_tasks",
    description:
      "Liste les éléments en attente d'action pour l'utilisateur (évaluations à valider, justificatifs, congés, factures en retard, dépenses, demandes). Ne renvoie que des compteurs et un lien vers la page concernée.",
    inputSchema: noInput,
    input: z.object({}).strict(),
    allowed: () => true,
    async run(rt) {
      const alerts = await managementAlerts(rt.ctx);
      return {
        data: { items: alerts.map((a) => ({ label: a.label, count: a.count, page: a.href })) },
        count: alerts.length,
      };
    },
  }),

  defineTool({
    name: "get_enrollment_summary",
    description:
      "Effectifs de l'année scolaire en cours par niveau (élèves actifs, filles, garçons, capacité). Données agrégées.",
    inputSchema: noInput,
    input: z.object({}).strict(),
    allowed: (ctx) => canSchoolWide(ctx, "students.read"),
    async run(rt) {
      const { year } = await loadAcademicFrame(rt.ctx);
      if (!year) return { data: { available: false, reason: "Aucune année scolaire n'est configurée." }, count: 0 };
      const rows = unwrapList(
        await rt.ctx.db.rpc("stats_enrollment_by_level", { p_school: rt.ctx.school.id, p_year: year.id }),
      );
      return {
        data: {
          year: year.name,
          levels: rows.map((r) => ({
            level: r.level_name,
            students: Number(r.students),
            girls: Number(r.girls),
            boys: Number(r.boys),
            capacity: Number(r.capacity),
          })),
          total: rows.reduce((s, r) => s + Number(r.students), 0),
        },
        count: rows.length,
      };
    },
  }),

  defineTool({
    name: "get_grades_summary",
    description:
      "Moyennes par classe pour le trimestre en cours, calculées à partir des notes réellement saisies. Par défaut seules les évaluations validées ou publiées sont prises en compte. Limité aux classes que l'utilisateur peut consulter.",
    inputSchema: {
      type: "object",
      properties: {
        include_unvalidated: {
          type: "boolean",
          description: "Inclure aussi les évaluations non encore validées (brouillons, soumises).",
        },
      },
      required: ["include_unvalidated"],
      additionalProperties: false,
    },
    input: z.object({ include_unvalidated: z.boolean() }).strict(),
    allowed: anyOf("grades.read"),
    async run(rt, input) {
      const { term } = await loadAcademicFrame(rt.ctx);
      if (!term) return { data: { available: false, reason: "Aucun trimestre n'est configuré." }, count: 0 };
      const rows = unwrapList(
        await rt.ctx.db.rpc("stats_class_performance", {
          p_school: rt.ctx.school.id,
          p_term: term.id,
          p_finalized_only: !input.include_unvalidated,
        }),
      );
      return {
        data: {
          term: term.name,
          scope: input.include_unvalidated ? "toutes les notes saisies" : "évaluations validées ou publiées",
          classes: rows.map((r) => ({
            class: r.class_name,
            average: r.average === null ? null : Number(r.average),
            students_graded: Number(r.students),
            below_passing: Number(r.below_passing),
          })),
          ...(rows.length === 0 ? { note: "Aucune note disponible pour ce périmètre." } : {}),
        },
        count: rows.length,
      };
    },
  }),

  defineTool({
    name: "get_students_at_risk",
    description:
      "Élèves dont la moyenne provisoire du trimestre en cours est sous le seuil de réussite (notes saisies, validées ou non). Les élèves sont désignés par une référence opaque [[eleve:…]].",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Nombre maximum d'élèves (1 à 20)." } },
      required: ["limit"],
      additionalProperties: false,
    },
    input: z.object({ limit: z.number().int().min(1).max(20) }).strict(),
    allowed: anyOf("grades.read"),
    async run(rt, input) {
      const { term } = await loadAcademicFrame(rt.ctx);
      if (!term) return { data: { available: false, reason: "Aucun trimestre n'est configuré." }, count: 0 };
      const rows = unwrapList(
        await rt.ctx.db.rpc("stats_students_at_risk", {
          p_school: rt.ctx.school.id,
          p_term: term.id,
          p_limit: input.limit,
        }),
      );
      return {
        data: {
          term: term.name,
          students: rows.map((r) => ({
            ...student(rt, r),
            class: r.class_name,
            provisional_average: r.average === null ? null : Number(r.average),
          })),
          ...(rows.length === 0 ? { note: "Aucun élève sous le seuil, ou aucune note saisie." } : {}),
        },
        count: rows.length,
      };
    },
  }),

  defineTool({
    name: "get_attendance_summary",
    description:
      "Synthèse des présences sur les N derniers jours : totaux présents/absents/retards/excusés, taux d'absence et élèves les plus absents (références opaques). Limité au périmètre de l'utilisateur.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", description: "Période en jours, de 1 à 90." } },
      required: ["days"],
      additionalProperties: false,
    },
    input: z.object({ days: z.number().int().min(1).max(90) }).strict(),
    allowed: anyOf("attendance.read"),
    async run(rt, input) {
      const from = daysAgo(input.days);
      const to = isoDate();
      const [daily, top] = await Promise.all([
        rt.ctx.db.rpc("stats_attendance_daily", { p_school: rt.ctx.school.id, p_from: from, p_to: to }),
        rt.ctx.db.rpc("stats_top_absentees", { p_school: rt.ctx.school.id, p_from: from, p_to: to, p_limit: 5 }),
      ]);
      const days = unwrapList(daily);
      const totals = days.reduce(
        (t, d) => ({
          present: t.present + Number(d.present),
          absent: t.absent + Number(d.absent),
          late: t.late + Number(d.late),
          excused: t.excused + Number(d.excused),
        }),
        { present: 0, absent: 0, late: 0, excused: 0 },
      );
      const marks = totals.present + totals.absent + totals.late + totals.excused;
      const absentees = unwrapList(top);
      return {
        data: {
          period: { from, to },
          records: marks,
          totals,
          absence_rate_percent: marks ? Math.round(((totals.absent + totals.excused) / marks) * 1000) / 10 : null,
          top_absentees: absentees.map((r) => ({
            ...student(rt, r),
            class: r.class_name,
            absences: Number(r.absences),
            unjustified: Number(r.unjustified),
            lates: Number(r.lates),
          })),
          ...(marks === 0 ? { note: "Aucun appel enregistré sur la période." } : {}),
        },
        count: days.length + absentees.length,
      };
    },
  }),

  defineTool({
    name: "get_finance_summary",
    description:
      "Synthèse financière de l'année en cours : montants facturés, encaissés, restant dus, en retard, nombre de factures. Montants dans la devise de l'établissement. Réservé aux profils financiers.",
    inputSchema: noInput,
    input: z.object({}).strict(),
    allowed: (ctx) => canSchoolWide(ctx, "finance.read"),
    async run(rt) {
      const { year } = await loadAcademicFrame(rt.ctx);
      const rows = unwrapList(
        await rt.ctx.db.rpc("stats_finance_summary", { p_school: rt.ctx.school.id, p_year: year?.id }),
      );
      const r = rows[0];
      if (!r || Number(r.invoices) === 0)
        return {
          data: {
            currency: rt.ctx.school.currency,
            available: false,
            reason: "Aucune facture émise pour cette période.",
          },
          count: 0,
        };
      return {
        data: {
          currency: rt.ctx.school.currency,
          year: year?.name ?? null,
          billed: Number(r.billed),
          collected: Number(r.collected),
          outstanding: Number(r.outstanding),
          overdue: Number(r.overdue),
          invoices: Number(r.invoices),
          overdue_invoices: Number(r.overdue_invoices),
          collection_rate_percent: Number(r.billed)
            ? Math.round((Number(r.collected) / Number(r.billed)) * 1000) / 10
            : null,
        },
        count: 1,
      };
    },
  }),

  defineTool({
    name: "get_incomplete_student_files",
    description:
      "Élèves actifs dont le dossier administratif est incomplet (pièces obligatoires manquantes). Élèves désignés par référence opaque.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Nombre maximum d'élèves (1 à 30)." } },
      required: ["limit"],
      additionalProperties: false,
    },
    input: z.object({ limit: z.number().int().min(1).max(30) }).strict(),
    allowed: (ctx) => canSchoolWide(ctx, "students.read"),
    async run(rt, input) {
      const rows = unwrapList(
        await rt.ctx.db.rpc("incomplete_student_files", { p_school: rt.ctx.school.id, p_limit: input.limit }),
      );
      return {
        data: {
          students: rows.map((r) => ({ ...student(rt, r), missing_documents: r.missing })),
          ...(rows.length === 0 ? { note: "Aucun dossier incomplet, ou aucune pièce obligatoire configurée." } : {}),
        },
        count: rows.length,
      };
    },
  }),

  defineTool({
    name: "propose_announcement_draft",
    description:
      "Prépare un BROUILLON d'annonce affiché à l'utilisateur pour relecture. N'enregistre rien et n'envoie rien : l'utilisateur doit confirmer explicitement, puis le brouillon suit le circuit normal de publication.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre (3 à 160 caractères)." },
        body: { type: "string", description: "Texte de l'annonce, en français, sans données personnelles d'élèves." },
        priority: { type: "string", enum: ["normal", "important", "urgent"] },
      },
      required: ["title", "body", "priority"],
      additionalProperties: false,
    },
    input: z
      .object({
        title: z.string().trim().min(3).max(160),
        body: z.string().trim().min(1).max(5000),
        priority: z.enum(["normal", "important", "urgent"]),
      })
      .strict(),
    allowed: (ctx) => can(ctx, "announcements.create", ["school"]),
    async run(rt, input) {
      if (rt.proposals.length >= 3)
        return { data: { status: "refused", reason: "Trop de brouillons proposés dans ce tour." }, count: 0 };
      rt.proposals.push({ kind: "announcement_draft", title: input.title, body: input.body, priority: input.priority });
      return { data: { status: "shown_to_user_for_confirmation", saved: false }, count: 1 };
    },
  }),

  defineTool({
    name: "list_accessible_pages",
    description:
      "Liste les pages de l'application auxquelles l'utilisateur a accès, pour l'aider à trouver où effectuer une action.",
    inputSchema: noInput,
    input: z.object({}).strict(),
    allowed: () => true,
    async run(rt) {
      const pages = buildNavigation({ permissions: rt.ctx.permissions, roles: rt.ctx.school.roles });
      return { data: { pages: pages.map((p) => ({ label: p.label, path: p.href })) }, count: pages.length };
    },
  }),
] as const satisfies readonly AssistantTool<z.ZodType>[];

export type ToolName = (typeof TOOLS)[number]["name"];

/** Tools offered to the model for this user (least privilege). */
export function toolsFor(ctx: AppContext): AssistantTool[] {
  return (TOOLS as readonly AssistantTool[]).filter((t) => t.allowed(ctx));
}

export type ToolOutcome = "ok" | "denied" | "invalid" | "error";

export interface ToolExecution {
  outcome: ToolOutcome;
  content: string;
  count: number | null;
}

/**
 * Executes a tool call coming from the model. The model's input is untrusted:
 * the tool must exist, be allowed for the current user, and the input must
 * validate. Internal error details are never returned to the model.
 */
export async function executeTool(rt: ToolRuntime, name: string, rawInput: unknown): Promise<ToolExecution> {
  const tool = (TOOLS as readonly AssistantTool[]).find((t) => t.name === name);
  if (!tool) return { outcome: "invalid", content: JSON.stringify({ error: "UNKNOWN_TOOL" }), count: null };
  if (!tool.allowed(rt.ctx)) {
    return {
      outcome: "denied",
      content: JSON.stringify({
        error: "FORBIDDEN",
        message: "L'utilisateur n'a pas l'autorisation d'accéder à ces données.",
      }),
      count: null,
    };
  }
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) return { outcome: "invalid", content: JSON.stringify({ error: "INVALID_INPUT" }), count: null };
  try {
    const out = await tool.run(rt, parsed.data);
    return { outcome: "ok", content: JSON.stringify({ data: out.data }), count: out.count ?? null };
  } catch (e) {
    const code = e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "UNKNOWN";
    return {
      outcome: code === "FORBIDDEN" ? "denied" : "error",
      content: JSON.stringify({
        error: code === "FORBIDDEN" ? "FORBIDDEN" : "TOOL_ERROR",
        message: "Les données n'ont pas pu être récupérées.",
      }),
      count: null,
    };
  }
}
