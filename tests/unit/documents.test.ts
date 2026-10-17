import { describe, expect, it, vi } from "vitest";
import { renderTemplate, unknownPlaceholders } from "@/features/documents/template";

vi.mock("server-only", () => ({}));

describe("renderTemplate", () => {
  it("substitutes whitelisted placeholders, tolerating spaces", () => {
    expect(
      renderTemplate("Élève {{student_full_name}} en {{ class_name }}.", {
        student_full_name: "Awa KONÉ",
        class_name: "6e A",
      }),
    ).toBe("Élève Awa KONÉ en 6e A.");
  });

  it("shows a dash for missing values and keeps unknown placeholders visible", () => {
    expect(renderTemplate("{{student_birth_place}} / {{password}}", {})).toBe("— / {{password}}");
    expect(unknownPlaceholders("{{password}} {{class_name}} {{x}}")).toEqual(["password", "x"]);
  });

  it("never interprets values as templates (no recursive expansion)", () => {
    expect(renderTemplate("{{custom_message}}", { custom_message: "{{school_name}}" })).toBe("{{school_name}}");
  });
});

describe("pdfSafe + PDF generation", () => {
  it("normalises typographic characters and produces a valid PDF", async () => {
    const { pdfSafe, PdfBuilder } = await import("@/server/pdf/builder");
    expect(pdfSafe("L’élève « Awa » — “3”…")).toBe('L\'élève « Awa » - "3"...');
    expect(pdfSafe("Emoji 🎓 ok")).toBe("Emoji  ok");
    const pdf = await PdfBuilder.create({ title: "Test", author: "École" });
    pdf.header({ name: "Groupe Scolaire Les Palmiers", lines: ["Abidjan"] }, "Réf. 1");
    pdf.title("CERTIFICAT DE SCOLARITÉ", "Année 2026-2027");
    pdf.paragraph("Je soussigné, certifie que l’élève est inscrit(e).");
    pdf.table(
      [
        { label: "Matière", width: 3 },
        { label: "Moyenne", width: 1, align: "right" },
      ],
      [["Mathématiques", "14,5"]],
    );
    const bytes = await pdf.finish("Généré le 17/10/2026");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
