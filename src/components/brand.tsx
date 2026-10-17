import { cn } from "@/lib/utils";

/** EduDigi mark: an open book whose pages form a rising chart (learning + insight). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#16834A" />
      <path d="M9 27.5V13.2c3.9-1.4 7.6-.8 11 1.8v14.3c-3.4-2.6-7.1-3.2-11-1.8Z" fill="#E8F6ED" />
      <path d="M31 27.5V13.2c-3.9-1.4-7.6-.8-11 1.8v14.3c3.4-2.6 7.1-3.2 11-1.8Z" fill="#fff" />
      <path d="M22.5 23.5l2.6-2.8 2.2 1.6 2.4-4.1" fill="none" stroke="#F5C542" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-bold tracking-tight", className)}>
      <LogoMark />
      <span className="text-lg">{name}</span>
    </span>
  );
}
