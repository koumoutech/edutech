/**
 * Document template rendering. Only whitelisted {{placeholders}} are substituted;
 * unknown placeholders are left visible so the template author can fix them.
 * Output is plain text (rendered to PDF), so no HTML injection is possible.
 */
export const TEMPLATE_PLACEHOLDERS = {
  school_name: "Nom de l'établissement",
  school_city: "Ville de l'établissement",
  signatory_name: "Nom du signataire",
  signatory_title: "Fonction du signataire",
  student_full_name: "Nom complet de l'élève",
  student_first_name: "Prénom de l'élève",
  student_last_name: "Nom de l'élève",
  student_birth_date: "Date de naissance",
  student_birth_place: "Lieu de naissance",
  student_matricule: "Matricule",
  class_name: "Classe",
  academic_year: "Année scolaire",
  absences_count: "Nombre d'absences",
  today: "Date du jour",
  custom_message: "Message libre",
} as const;

export type PlaceholderKey = keyof typeof TEMPLATE_PLACEHOLDERS;
export type TemplateValues = Partial<Record<PlaceholderKey, string | number | null | undefined>>;

const PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function renderTemplate(body: string, values: TemplateValues): string {
  return body.replace(PATTERN, (match, key: string) => {
    if (!(key in TEMPLATE_PLACEHOLDERS)) return match;
    const v = values[key as PlaceholderKey];
    return v === null || v === undefined || v === "" ? "—" : String(v);
  });
}

export function unknownPlaceholders(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(PATTERN)) if (!(m[1] in TEMPLATE_PLACEHOLDERS)) out.add(m[1]);
  return [...out];
}
