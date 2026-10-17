import "server-only";
import { formatDate, formatMoney, formatScore, fullName } from "@/lib/utils";
import { PdfBuilder } from "./builder";

export interface SchoolHeader {
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
}

const headerLines = (s: SchoolHeader) => [
  [s.address, s.city].filter(Boolean).join(", "),
  [s.phone, s.email].filter(Boolean).join(" · "),
];

export async function reportCardPdf(
  school: SchoolHeader,
  rc: {
    id: string;
    average: number | null;
    rank: number | null;
    class_size: number | null;
    class_average: number | null;
    mention: string | null;
    absences_count: number;
    lates_count: number;
    appreciation: string | null;
    decision: string | null;
    status: string;
    student: { first_name: string; last_name: string; matricule: string; birth_date: string | null } | null;
    term: { name: string } | null;
    class: {
      name: string;
      homeroom: { first_name: string; last_name: string } | null;
      year: { name: string } | null;
    } | null;
    report_card_lines: {
      subject_name: string;
      teacher_name: string | null;
      coefficient: number;
      average: number | null;
      class_average: number | null;
      min_average: number | null;
      max_average: number | null;
      rank: number | null;
      teacher_comment: string | null;
    }[];
  },
): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create({ title: `Bulletin ${fullName(rc.student)}`, author: school.name });
  pdf.header({ name: school.name, lines: headerLines(school) }, `Année ${rc.class?.year?.name ?? ""}`);
  pdf.title("BULLETIN DE NOTES", `${rc.term?.name ?? ""}${rc.status !== "published" ? " — document provisoire" : ""}`);
  pdf.keyValues(
    [
      ["Élève", fullName(rc.student)],
      ["Matricule", rc.student?.matricule ?? ""],
      ["Classe", rc.class?.name ?? ""],
      ["Né(e) le", formatDate(rc.student?.birth_date)],
      ["Professeur principal", rc.class?.homeroom ? fullName(rc.class.homeroom) : "—"],
      ["Effectif", String(rc.class_size ?? "—")],
    ],
    3,
  );
  const totalCoef = rc.report_card_lines.reduce((s, l) => s + (l.average === null ? 0 : Number(l.coefficient)), 0);
  pdf.table(
    [
      { label: "Matière", width: 3.2 },
      { label: "Coef.", width: 0.8, align: "center" },
      { label: "Moy.", width: 1, align: "right" },
      { label: "Moy. classe", width: 1.2, align: "right" },
      { label: "Min / Max", width: 1.4, align: "center" },
      { label: "Rang", width: 0.8, align: "center" },
      { label: "Appréciation", width: 3.4 },
    ],
    rc.report_card_lines.map((l) => [
      `${l.subject_name}${l.teacher_name ? `\n${l.teacher_name}` : ""}`,
      formatScore(Number(l.coefficient)),
      formatScore(l.average === null ? null : Number(l.average)),
      formatScore(l.class_average === null ? null : Number(l.class_average)),
      `${formatScore(l.min_average === null ? null : Number(l.min_average))} / ${formatScore(l.max_average === null ? null : Number(l.max_average))}`,
      l.rank ? String(l.rank) : "—",
      l.teacher_comment ?? "",
    ]),
    {
      zebra: true,
      footer: [
        "Moyenne générale",
        formatScore(totalCoef),
        formatScore(rc.average === null ? null : Number(rc.average)),
        formatScore(rc.class_average === null ? null : Number(rc.class_average)),
        "",
        rc.rank ? `${rc.rank}/${rc.class_size}` : "—",
        rc.mention ?? "",
      ],
    },
  );
  pdf.keyValues(
    [
      ["Absences", String(rc.absences_count)],
      ["Retards", String(rc.lates_count)],
      ["Mention", rc.mention ?? "—"],
    ],
    3,
  );
  pdf.box(rc.appreciation || "—", "APPRÉCIATION DU CONSEIL DE CLASSE");
  if (rc.decision) pdf.box(rc.decision, "DÉCISION");
  pdf.signature(`Fait à ${school.city ?? "—"}, le ${formatDate(new Date())}`, "Le chef d'établissement");
  return pdf.finish(`${school.name} · Bulletin ${rc.id.slice(0, 8).toUpperCase()}`);
}

export async function receiptPdf(
  school: SchoolHeader,
  p: {
    receipt_number: string;
    amount: number;
    paid_at: string;
    reference: string | null;
    payer_name: string | null;
    status: string;
    method: { name: string } | null;
    student: { first_name: string; last_name: string; matricule: string } | null;
    allocations: { amount: number; invoice: { number: string; total: number; balance: number } | null }[];
  },
): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create({ title: `Reçu ${p.receipt_number}`, author: school.name });
  pdf.header({ name: school.name, lines: headerLines(school) }, p.receipt_number);
  pdf.title("REÇU DE PAIEMENT", p.status === "reversed" ? "ANNULÉ" : undefined);
  pdf.keyValues([
    ["Reçu n°", p.receipt_number],
    ["Date", formatDate(p.paid_at, { hour: "2-digit", minute: "2-digit" })],
    ["Élève", `${fullName(p.student)} (${p.student?.matricule ?? ""})`],
    ["Payeur", p.payer_name ?? "—"],
    ["Mode de paiement", p.method?.name ?? "—"],
    ["Référence", p.reference ?? "—"],
  ]);
  pdf.table(
    [
      { label: "Facture", width: 2 },
      { label: "Total facture", width: 1.5, align: "right" },
      { label: "Montant affecté", width: 1.5, align: "right" },
      { label: "Reste dû", width: 1.5, align: "right" },
    ],
    p.allocations.map((a) => [
      a.invoice?.number ?? "",
      formatMoney(a.invoice?.total, school.currency),
      formatMoney(a.amount, school.currency),
      formatMoney(a.invoice?.balance, school.currency),
    ]),
    { footer: ["Total reçu", "", formatMoney(p.amount, school.currency), ""] },
  );
  pdf.paragraph("Ce reçu atteste de l'encaissement du montant indiqué. Conservez-le précieusement.", { size: 9 });
  pdf.signature(`Fait à ${school.city ?? "—"}, le ${formatDate(new Date())}`, "Le service comptable");
  return pdf.finish(`${school.name} · Reçu ${p.receipt_number}`);
}

export async function certificatePdf(
  school: SchoolHeader,
  doc: { title: string; body: string; signatory: string; reference: string },
): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create({ title: doc.title, author: school.name });
  pdf.header({ name: school.name, lines: headerLines(school) }, `Réf. ${doc.reference}`);
  pdf.spacer(20);
  pdf.title(doc.title);
  pdf.spacer(10);
  pdf.paragraph(doc.body, { size: 11.5, gap: 20 });
  pdf.signature(`Fait à ${school.city ?? "—"}, le ${formatDate(new Date())}`, doc.signatory);
  return pdf.finish(`${school.name} · ${doc.title} · Réf. ${doc.reference}`);
}

export async function classListPdf(
  school: SchoolHeader,
  title: string,
  columns: string[],
  rows: string[][],
): Promise<Uint8Array> {
  const pdf = await PdfBuilder.create({ title, author: school.name });
  pdf.header({ name: school.name, lines: headerLines(school) });
  pdf.title(title);
  pdf.table(
    columns.map((c, i) => ({ label: c, width: i === 0 ? 0.6 : 2 })),
    rows,
    { zebra: true },
  );
  return pdf.finish(`${school.name} · ${title}`);
}
