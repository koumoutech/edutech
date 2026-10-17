import Link from "next/link";
import { Logo } from "@/components/brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/" aria-label="Accueil">
        <Logo name="EduDigi" />
      </Link>
      <article className="mt-8 space-y-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold">{children}</article>
    </div>
  );
}
