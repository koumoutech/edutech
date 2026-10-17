import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, safe renderer for assistant answers: paragraphs, bullet/numbered
 * lists, short headings, **bold**, and student references. Everything is
 * rendered as React text nodes — no HTML from the model ever reaches the DOM.
 */

const INLINE_RE = /(\*\*[^*\n]+\*\*|\[\[eleve:[0-9a-fA-F-]{36}\]\])/g;

function inline(text: string, students: Record<string, string | null>, keyBase: string): ReactNode[] {
  return text.split(INLINE_RE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    const ref = /^\[\[eleve:([0-9a-fA-F-]{36})\]\]$/.exec(part);
    if (ref) {
      const id = ref[1].toLowerCase();
      const name = students[id];
      return name ? (
        <Link key={key} href={`/app/students/${id}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {name}
        </Link>
      ) : (
        <span key={key} className="rounded bg-muted px-1 text-muted-foreground" title="Élève non accessible avec vos droits">
          élève (accès restreint)
        </span>
      );
    }
    return part;
  });
}

type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1] });
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export function RichText({ text, students }: { text: string; students: Record<string, string | null> }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {parseBlocks(text).map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "h") return <p key={k} className="pt-1 font-semibold">{inline(b.text, students, k)}</p>;
        if (b.kind === "p") return <p key={k}>{inline(b.text, students, k)}</p>;
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List key={k} className={b.kind === "ul" ? "list-disc space-y-1 pl-5" : "list-decimal space-y-1 pl-5"}>
            {b.items.map((it, j) => (
              <li key={`${k}-${j}`}>{inline(it, students, `${k}-${j}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
