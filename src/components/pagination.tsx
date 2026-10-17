import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Server-side pagination links preserving the current query string. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between gap-2 pt-4 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">
        Page {page} sur {pages} · {total} résultat{total > 1 ? "s" : ""}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(page - 1)} aria-label="Page précédente">
            <ChevronLeftIcon /> Précédent
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(page + 1)} aria-label="Page suivante">
            Suivant <ChevronRightIcon />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
