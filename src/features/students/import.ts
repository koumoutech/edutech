import { parseCsv } from "@/lib/csv";

/** Expected CSV columns (headers are normalised: accents/case/spaces ignored). */
export const IMPORT_COLUMNS = [
  { key: "matricule", label: "matricule", required: false },
  { key: "prenom", label: "prenom", required: true },
  { key: "nom", label: "nom", required: true },
  { key: "sexe", label: "sexe (F/M)", required: false },
  { key: "date_naissance", label: "date_naissance (JJ/MM/AAAA)", required: false },
  { key: "lieu_naissance", label: "lieu_naissance", required: false },
  { key: "classe", label: "classe (nom exact)", required: false },
  { key: "responsable_prenom", label: "responsable_prenom", required: false },
  { key: "responsable_nom", label: "responsable_nom", required: false },
  { key: "responsable_telephone", label: "responsable_telephone", required: false },
  { key: "responsable_email", label: "responsable_email", required: false },
  { key: "lien", label: "lien (mere/pere/tuteur/autre)", required: false },
] as const;

export const MAX_IMPORT_ROWS = 1000;

export interface ImportRow {
  line: number;
  student: {
    matricule?: string;
    first_name: string;
    last_name: string;
    gender?: "F" | "M";
    birth_date?: string;
    birth_place?: string;
  };
  class_id?: string;
  guardian?: {
    first_name: string;
    last_name: string;
    phone?: string;
    email?: string;
    relationship: "mother" | "father" | "tutor" | "grandparent" | "other";
  };
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  errors: ImportIssue[];
  totalLines: number;
}

function parseDate(v: string): string | undefined | null {
  if (!v) return undefined;
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (match) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1990 || date > new Date()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const RELATIONSHIPS: Record<string, NonNullable<ImportRow["guardian"]>["relationship"]> = {
  mere: "mother",
  mother: "mother",
  pere: "father",
  father: "father",
  tuteur: "tutor",
  tutrice: "tutor",
  tutor: "tutor",
  "grand-parent": "grandparent",
  grand_parent: "grandparent",
  grandparent: "grandparent",
};

/**
 * Validates an import file entirely before anything is written:
 * required fields, formats, class names, duplicate matricules (file and database).
 */
export function validateStudentImport(
  csvText: string,
  opts: { classesByName: Map<string, string>; existingMatricules: Set<string> },
): ImportPreview {
  const { rows } = parseCsv(csvText);
  const errors: ImportIssue[] = [];
  const valid: ImportRow[] = [];
  const seen = new Set<string>();

  if (rows.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 0, message: `Le fichier dépasse ${MAX_IMPORT_ROWS} lignes.` }], totalLines: rows.length };
  }

  rows.forEach((r, index) => {
    const line = index + 2; // header is line 1
    const issues: string[] = [];
    const first = (r.prenom ?? "").trim();
    const last = (r.nom ?? "").trim();
    if (!first) issues.push("prénom manquant");
    if (!last) issues.push("nom manquant");
    if (first.length > 80 || last.length > 80) issues.push("nom ou prénom trop long");

    const matricule = (r.matricule ?? "").trim().toUpperCase() || undefined;
    if (matricule) {
      if (!/^[A-Z0-9-]{3,32}$/.test(matricule)) issues.push("matricule invalide");
      else if (seen.has(matricule)) issues.push("matricule en double dans le fichier");
      else if (opts.existingMatricules.has(matricule)) issues.push("matricule déjà utilisé");
      seen.add(matricule);
    }

    const sexeRaw = (r.sexe ?? "").trim().toUpperCase();
    const gender = sexeRaw === "F" || sexeRaw === "M" ? sexeRaw : undefined;
    if (sexeRaw && !gender) issues.push("sexe invalide (F ou M)");

    const birth = parseDate((r.date_naissance ?? "").trim());
    if (birth === null) issues.push("date de naissance invalide");

    let class_id: string | undefined;
    const className = (r.classe ?? "").trim();
    if (className) {
      class_id = opts.classesByName.get(className.toLowerCase());
      if (!class_id) issues.push(`classe « ${className} » introuvable pour l'année en cours`);
    }

    let guardian: ImportRow["guardian"];
    const gFirst = (r.responsable_prenom ?? "").trim();
    const gLast = (r.responsable_nom ?? "").trim();
    const gEmail = (r.responsable_email ?? "").trim().toLowerCase();
    if (gFirst || gLast) {
      if (!gFirst || !gLast) issues.push("nom et prénom du responsable requis ensemble");
      if (gEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(gEmail)) issues.push("e-mail du responsable invalide");
      guardian = {
        first_name: gFirst,
        last_name: gLast,
        phone: (r.responsable_telephone ?? "").trim() || undefined,
        email: gEmail || undefined,
        relationship: RELATIONSHIPS[(r.lien ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? "other",
      };
    }

    if (issues.length) {
      errors.push({ line, message: issues.join(", ") });
      return;
    }
    valid.push({
      line,
      student: {
        matricule,
        first_name: first,
        last_name: last,
        gender,
        birth_date: birth ?? undefined,
        birth_place: (r.lieu_naissance ?? "").trim() || undefined,
      },
      class_id,
      guardian,
    });
  });

  return { rows: valid, errors, totalLines: rows.length };
}

export function importTemplateCsv(): string {
  return (
    "﻿" +
    IMPORT_COLUMNS.map((c) => c.key).join(";") +
    "\n" +
    ";Awa;Koné;F;14/03/2014;Abidjan;6e A;Mariam;Koné;+225 07 00 00 00;mariam.kone@example.com;mere\n"
  );
}
