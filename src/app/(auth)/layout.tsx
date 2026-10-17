import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { getBranding } from "@/server/platform";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { productName } = await getBranding();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Accueil">
            <Logo name={productName} />
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-muted-foreground text-center text-xs">Connexion sécurisée · Données protégées</p>
      </div>
      <aside className="bg-brand-deep relative hidden overflow-hidden lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(40rem_30rem_at_20%_20%,#16834A,transparent),radial-gradient(30rem_20rem_at_80%_80%,#F5C54240,transparent)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="max-w-md text-3xl leading-tight font-bold text-balance">
            « Une seule plateforme pour l&apos;administration, la pédagogie, les familles et les finances. »
          </p>
          <p className="mt-4 text-white/70">{productName} — gestion scolaire intelligente</p>
        </div>
      </aside>
    </div>
  );
}
