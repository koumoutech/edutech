import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const GREEN = rgb(0.086, 0.514, 0.29); // #16834A
const DEEP = rgb(0.043, 0.365, 0.208); // #0B5D35
const INK = rgb(0.09, 0.11, 0.098); // #171C19
const MUTED = rgb(0.42, 0.46, 0.435); // #6B756F
const LINE = rgb(0.88, 0.9, 0.89);
const SOFT = rgb(0.91, 0.965, 0.93); // #E8F6ED

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

/**
 * Standard fonts use WinAnsi encoding: characters outside it would throw,
 * so text is normalised to the supported set (French accents are supported).
 */
export function pdfSafe(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ")
    .replace(/[^\x20-\x7E -ÿŒœ€\n]/g, "");
}

export class PdfBuilder {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private font!: PDFFont;
  private bold!: PDFFont;
  private y = 0;

  static async create(meta: { title: string; author: string }) {
    const b = new PdfBuilder();
    b.doc = await PDFDocument.create();
    b.doc.setTitle(pdfSafe(meta.title));
    b.doc.setAuthor(pdfSafe(meta.author));
    b.doc.setCreator("EduDigi");
    b.font = await b.doc.embedFont(StandardFonts.Helvetica);
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold);
    b.newPage();
    return b;
  }

  private newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 30) this.newPage();
  }

  get width() {
    return A4[0] - MARGIN * 2;
  }

  header(school: { name: string; lines: string[] }, right?: string) {
    this.page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: GREEN });
    this.page.drawText(pdfSafe(school.name), { x: MARGIN, y: this.y - 10, size: 15, font: this.bold, color: DEEP });
    let yy = this.y - 26;
    for (const l of school.lines.filter(Boolean)) {
      this.page.drawText(pdfSafe(l), { x: MARGIN, y: yy, size: 9, font: this.font, color: MUTED });
      yy -= 12;
    }
    if (right) {
      const w = this.font.widthOfTextAtSize(pdfSafe(right), 9);
      this.page.drawText(pdfSafe(right), {
        x: A4[0] - MARGIN - w,
        y: this.y - 10,
        size: 9,
        font: this.font,
        color: MUTED,
      });
    }
    this.y = yy - 10;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 1,
      color: LINE,
    });
    this.y -= 24;
  }

  title(text: string, subtitle?: string) {
    this.ensure(50);
    const t = pdfSafe(text);
    const w = this.bold.widthOfTextAtSize(t, 17);
    this.page.drawText(t, { x: (A4[0] - w) / 2, y: this.y, size: 17, font: this.bold, color: INK });
    this.y -= 18;
    if (subtitle) {
      const s = pdfSafe(subtitle);
      const sw = this.font.widthOfTextAtSize(s, 10);
      this.page.drawText(s, { x: (A4[0] - sw) / 2, y: this.y, size: 10, font: this.font, color: MUTED });
      this.y -= 14;
    }
    this.y -= 14;
  }

  private wrap(text: string, size: number, maxWidth: number, font = this.font): string[] {
    const out: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      if (!para.trim()) {
        out.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          out.push(line);
          line = word;
        } else line = candidate;
      }
      out.push(line);
    }
    return out;
  }

  paragraph(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.bold : this.font;
    for (const line of this.wrap(text, size, this.width, font)) {
      this.ensure(size + 6);
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= size + 5;
    }
    this.y -= opts.gap ?? 8;
  }

  keyValues(pairs: [string, string][], columns = 2) {
    const colW = this.width / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      this.ensure(30);
      pairs.slice(i, i + columns).forEach(([k, v], j) => {
        const x = MARGIN + j * colW;
        this.page.drawText(pdfSafe(k), { x, y: this.y, size: 8, font: this.font, color: MUTED });
        this.page.drawText(pdfSafe(v), { x, y: this.y - 12, size: 10.5, font: this.bold, color: INK });
      });
      this.y -= 30;
    }
    this.y -= 4;
  }

  table(
    columns: { label: string; width: number; align?: "left" | "right" | "center" }[],
    rows: string[][],
    opts: { zebra?: boolean; footer?: string[] } = {},
  ) {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.width);
    const drawRow = (cells: string[], bold: boolean, fill?: ReturnType<typeof rgb>) => {
      const lines = cells.map((c, i) => this.wrap(c, 9, widths[i] - 8, bold ? this.bold : this.font));
      const h = Math.max(...lines.map((l) => l.length)) * 11 + 8;
      this.ensure(h);
      if (fill) this.page.drawRectangle({ x: MARGIN, y: this.y - h + 11, width: this.width, height: h, color: fill });
      let x = MARGIN;
      cells.forEach((_, i) => {
        lines[i].forEach((l, k) => {
          const f = bold ? this.bold : this.font;
          const w = f.widthOfTextAtSize(l, 9);
          const align = columns[i].align ?? "left";
          const tx = align === "right" ? x + widths[i] - 4 - w : align === "center" ? x + (widths[i] - w) / 2 : x + 4;
          this.page.drawText(l, { x: tx, y: this.y - k * 11, size: 9, font: f, color: INK });
        });
        x += widths[i];
      });
      this.y -= h;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y + 9 },
        end: { x: MARGIN + this.width, y: this.y + 9 },
        thickness: 0.5,
        color: LINE,
      });
    };
    drawRow(
      columns.map((c) => c.label),
      true,
      SOFT,
    );
    rows.forEach((r, i) => drawRow(r, false, opts.zebra && i % 2 === 1 ? rgb(0.975, 0.98, 0.977) : undefined));
    if (opts.footer) drawRow(opts.footer, true, SOFT);
    this.y -= 10;
  }

  box(text: string, label?: string) {
    const lines = this.wrap(text, 10, this.width - 20);
    const h = lines.length * 14 + (label ? 18 : 8) + 10;
    this.ensure(h);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - h + 12,
      width: this.width,
      height: h,
      borderColor: LINE,
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });
    let yy = this.y - 4;
    if (label) {
      this.page.drawText(pdfSafe(label), { x: MARGIN + 10, y: yy, size: 8, font: this.bold, color: GREEN });
      yy -= 16;
    }
    for (const l of lines) {
      this.page.drawText(l, { x: MARGIN + 10, y: yy, size: 10, font: this.font, color: INK });
      yy -= 14;
    }
    this.y -= h + 6;
  }

  signature(place: string, signatory: string) {
    this.ensure(90);
    this.y -= 10;
    const x = MARGIN + this.width / 2 + 20;
    this.page.drawText(pdfSafe(place), { x, y: this.y, size: 10, font: this.font, color: INK });
    this.page.drawText(pdfSafe(signatory), { x, y: this.y - 16, size: 10, font: this.bold, color: INK });
    this.page.drawText("Signature et cachet", { x, y: this.y - 30, size: 8, font: this.font, color: MUTED });
    this.y -= 80;
  }

  spacer(h = 10) {
    this.y -= h;
  }

  async finish(footer: string): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const t = pdfSafe(`${footer} — page ${i + 1}/${pages.length}`);
      p.drawText(t, { x: MARGIN, y: 24, size: 7.5, font: this.font, color: MUTED });
    });
    return this.doc.save();
  }
}
