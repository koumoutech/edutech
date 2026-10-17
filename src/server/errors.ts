/**
 * Error model shared by services and actions. Database functions raise stable codes
 * (e.g. `FORBIDDEN: ...`, `CLASS_FULL: ...`) that are mapped to user-facing French messages.
 * Raw database messages are never shown to users.
 */

export const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Votre session a expiré. Veuillez vous reconnecter.",
  FORBIDDEN: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  NOT_FOUND: "L'élément demandé est introuvable ou n'est pas accessible.",
  VALIDATION: "Certaines informations sont invalides.",
  RATE_LIMITED: "Trop de tentatives. Veuillez patienter quelques minutes.",
  CONFLICT: "Cet élément existe déjà.",
  CLASS_FULL: "La classe a atteint sa capacité maximale.",
  CLASS_YEAR_MISMATCH: "La classe n'appartient pas à l'année scolaire choisie.",
  STUDENT_NOT_IN_CLASS: "L'élève n'est pas inscrit dans cette classe.",
  SCORE_OUT_OF_RANGE: "Une note dépasse le barème de l'évaluation.",
  GRADE_LOCKED: "Les notes validées ne peuvent être modifiées que par la procédure de correction.",
  ASSESSMENT_LOCKED: "Cette évaluation est validée et ne peut plus être modifiée.",
  NO_GRADES: "Aucune note n'a encore été saisie.",
  INVALID_TRANSITION: "Ce changement de statut n'est pas autorisé.",
  REASON_REQUIRED: "Un motif d'au moins 5 caractères est obligatoire.",
  OVERPAYMENT: "Le montant dépasse le solde restant dû des factures ouvertes.",
  INVALID_ALLOCATION: "La répartition du paiement est invalide.",
  INVOICE_NOT_PAYABLE: "La facture n'est pas payable (brouillon ou annulée).",
  INVOICE_HAS_PAYMENTS: "Annulez ou remboursez d'abord les paiements de cette facture.",
  INVOICE_LOCKED: "Seules les factures en brouillon sont modifiables.",
  EMPTY_INVOICE: "La facture doit contenir au moins une ligne d'un montant positif.",
  REFERENCE_REQUIRED: "La référence de transaction est obligatoire pour ce mode de paiement.",
  INVALID_AMOUNT: "Montant invalide.",
  FUTURE_DATE: "La date ne peut pas être dans le futur.",
  INVITATION_INVALID: "Cette invitation est invalide ou a déjà été utilisée.",
  INVITATION_EXPIRED: "Cette invitation a expiré. Demandez-en une nouvelle.",
  INVITATION_EMAIL_MISMATCH: "Cette invitation a été envoyée à une autre adresse e-mail.",
  LAST_ADMIN: "L'établissement doit conserver au moins un administrateur.",
  INVALID_RECIPIENTS: "Destinataires invalides.",
  TIMETABLE_CONFLICT: "Conflit d'emploi du temps : la classe, l'enseignant ou la salle est déjà occupé(e) sur ce créneau.",
  ALREADY_INITIALIZED: "La plateforme est déjà initialisée.",
  AI_DISABLED: "L'assistant IA n'est pas configuré sur cette plateforme.",
  AI_UNAVAILABLE: "L'assistant IA est momentanément indisponible. Réessayez dans quelques instants.",
  UNKNOWN: "Une erreur inattendue est survenue. Réessayez ou contactez le support.",
};

export type ErrorCode = keyof typeof ERROR_MESSAGES | (string & {});

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message ?? ERROR_MESSAGES[code] ?? ERROR_MESSAGES.UNKNOWN);
    this.name = "AppError";
  }
}

interface PgLikeError {
  message?: string;
  code?: string;
  details?: string;
}

/** Converts a PostgREST/PostgreSQL error into an AppError with a safe message. */
export function fromDbError(error: PgLikeError | null | undefined): AppError {
  if (!error) return new AppError("UNKNOWN");
  const message = error.message ?? "";
  const match = /^([A-Z_]{3,40})(?::|$)/.exec(message);
  if (match && ERROR_MESSAGES[match[1]]) return new AppError(match[1]);
  switch (error.code) {
    case "42501":
      return new AppError("FORBIDDEN");
    case "23505":
      return new AppError("CONFLICT");
    case "23P01":
      return new AppError("TIMETABLE_CONFLICT");
    case "PGRST116":
      return new AppError("NOT_FOUND");
    case "23503":
      return new AppError("VALIDATION", "Cet élément est référencé par d'autres données.");
    case "23514":
    case "22023":
    case "22P02":
      return new AppError("VALIDATION");
    case "28000":
      return new AppError("UNAUTHENTICATED");
  }
  if (/row-level security/i.test(message)) return new AppError("FORBIDDEN");
  return new AppError("UNKNOWN");
}

/** Throws a mapped AppError on error, NOT_FOUND when no row came back. */
export function unwrap<R extends { data: unknown; error: PgLikeError | null }>(result: R): NonNullable<R["data"]> {
  if (result.error) throw fromDbError(result.error);
  if (result.data === null || result.data === undefined) throw new AppError("NOT_FOUND");
  return result.data as NonNullable<R["data"]>;
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string[]> };

export function toActionError(e: unknown): Extract<ActionResult, { ok: false }> {
  if (e instanceof AppError) {
    return { ok: false, error: e.message, code: e.code, fieldErrors: e.fieldErrors };
  }
  // Never leak internals: log server-side, return a generic message.
  console.error("[action] unexpected error", e instanceof Error ? e.message : e);
  return { ok: false, error: ERROR_MESSAGES.UNKNOWN, code: "UNKNOWN" };
}

/** Like `unwrap` for list queries: never returns null. */
export function unwrapList<R extends { data: unknown[] | null; error: PgLikeError | null }>(result: R): NonNullable<R["data"]> {
  if (result.error) throw fromDbError(result.error);
  return (result.data ?? []) as NonNullable<R["data"]>;
}
