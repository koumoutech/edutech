import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
