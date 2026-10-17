import { describe, expect, it } from "vitest";
import { importTemplateCsv, validateStudentImport } from "@/features/students/import";
import { sanitizeCell, toCsv } from "@/lib/csv";

const opts = {
  classesByName: new Map([["6e a", "class-6a"]]),
  existingMatricules: new Set(["26-00001"]),
};

describe("CSV export", () => {
  it("neutralises formula injection", () => {
    expect(sanitizeCell('=HYPERLINK("http://evil")')).toBe('\'=HYPERLINK("http://evil")');
    expect(sanitizeCell("+33 6 00")).toBe("'+33 6 00");
    expect(sanitizeCell("@cmd")).toBe("'@cmd");
    expect(sanitizeCell("Awa")).toBe("Awa");
    expect(sanitizeCell(-5)).toBe("-5");
    expect(sanitizeCell(null)).toBe("");
  });

  it("produces a ; separated file with BOM and quoted cells", () => {
    const csv = toCsv(
      [{ n: "Koné; Awa", v: 12 }],
      [
        { header: "Nom", value: (r) => r.n },
        { header: "Note", value: (r) => r.v },
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Nom";"Note"');
    expect(csv).toContain('"Koné; Awa";"12"');
  });
});

describe("student CSV import", () => {
  it("accepts the downloadable template", () => {
    const res = validateStudentImport(importTemplateCsv(), opts);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      class_id: "class-6a",
      student: { first_name: "Awa", last_name: "Koné", gender: "F", birth_date: "2014-03-14" },
      guardian: { relationship: "mother", email: "mariam.kone@example.com" },
    });
  });

  it("normalises headers (accents, case, spaces)", () => {
    const res = validateStudentImport("Prénom;Nom;Date naissance\nIbrahim;Bamba;2013-01-05\n", opts);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].student.birth_date).toBe("2013-01-05");
  });

  it("reports every invalid line with its number without importing anything partially", () => {
    const csv = [
      "matricule;prenom;nom;sexe;date_naissance;classe",
      "26-00001;Awa;Koné;F;14/03/2014;6e A",
      "AB-1;Yao;;X;31/02/2014;7e Z",
      "NEW-1;Ok;Valide;M;01/01/2014;",
      "NEW-1;Dup;Licate;M;;",
    ].join("\n");
    const res = validateStudentImport(csv, opts);
    expect(res.rows.map((r) => r.line)).toEqual([4]);
    expect(res.errors).toEqual([
      { line: 2, message: "matricule déjà utilisé" },
      { line: 3, message: expect.stringContaining("nom manquant") },
      { line: 5, message: "matricule en double dans le fichier" },
    ]);
    expect(res.errors[1].message).toContain("sexe invalide");
    expect(res.errors[1].message).toContain("date de naissance invalide");
    expect(res.errors[1].message).toContain("classe « 7e Z » introuvable");
  });

  it("rejects future birth dates", () => {
    const res = validateStudentImport("prenom;nom;date_naissance\nA;B;01/01/2999\n", opts);
    expect(res.errors[0].message).toContain("date de naissance invalide");
  });

  it("caps file size", () => {
    const csv = "prenom;nom\n" + Array.from({ length: 1001 }, (_, i) => `P${i};N${i}`).join("\n");
    const res = validateStudentImport(csv, opts);
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0].message).toContain("1000");
  });
});
