import {
  ArrowRightIcon,
  BarChart3Icon,
  BellRingIcon,
  BookOpenCheckIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  CalculatorIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  CloudIcon,
  FileTextIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  LockKeyholeIcon,
  type LucideIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "@/features/landing/hero-visual";
import { Reveal } from "@/features/landing/reveal";
import { getBranding } from "@/server/platform";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: UsersIcon,
    title: "Élèves & inscriptions",
    text: "Dossiers complets, matricules, responsables légaux, réinscriptions, transferts et import CSV validé.",
  },
  {
    icon: BookOpenCheckIcon,
    title: "Notes & bulletins",
    text: "Coefficients, barèmes configurables, validation, publication et bulletins générés automatiquement.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Présences",
    text: "Appel en quelques secondes sur téléphone, justificatifs en ligne et alertes aux parents.",
  },
  {
    icon: CalendarClockIcon,
    title: "Emplois du temps",
    text: "Détection automatique des conflits de classe, d'enseignant et de salle, remplacements.",
  },
  {
    icon: WalletIcon,
    title: "Finances scolaires",
    text: "Factures, échéanciers, paiements partiels, Mobile Money, reçus, impayés et budgets.",
  },
  {
    icon: BriefcaseIcon,
    title: "Personnel & RH",
    text: "Dossiers, contrats, congés avec circuit de validation et remplacements.",
  },
  {
    icon: BellRingIcon,
    title: "Communication",
    text: "Annonces ciblées, messagerie encadrée, notifications in-app, e-mail et SMS.",
  },
  {
    icon: FileTextIcon,
    title: "Documents",
    text: "Certificats, attestations, reçus et bulletins PDF à partir de modèles personnalisables.",
  },
  {
    icon: BarChart3Icon,
    title: "Rapports & analyses",
    text: "Effectifs, réussite, absences, recouvrement : des indicateurs fiables et exportables.",
  },
];

const SPACES: { icon: LucideIcon; role: string; items: string[] }[] = [
  {
    icon: GraduationCapIcon,
    role: "Direction",
    items: ["Effectifs et réussite", "Indicateurs financiers", "Validations et alertes"],
  },
  {
    icon: BookOpenCheckIcon,
    role: "Enseignants",
    items: ["Classes et emploi du temps", "Saisie des notes", "Appel mobile"],
  },
  {
    icon: HeartHandshakeIcon,
    role: "Parents",
    items: ["Résultats et bulletins", "Absences et justificatifs", "Frais et paiements"],
  },
  { icon: UsersIcon, role: "Élèves", items: ["Notes publiées", "Devoirs et examens", "Annonces"] },
  {
    icon: CalculatorIcon,
    role: "Comptabilité",
    items: ["Encaissements", "Impayés et échéances", "Dépenses et budgets"],
  },
  { icon: FileTextIcon, role: "Secrétariat", items: ["Inscriptions", "Dossiers incomplets", "Certificats"] },
];

const ADVANTAGES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ShieldCheckIcon,
    title: "Sécurité by design",
    text: "Permissions vérifiées côté serveur et isolation des établissements dans la base de données (Row Level Security).",
  },
  {
    icon: SmartphoneIcon,
    title: "Pensé pour le mobile",
    text: "Interfaces conçues d'abord pour le téléphone, puis adaptées aux tablettes et ordinateurs.",
  },
  {
    icon: CloudIcon,
    title: "Prêt pour le cloud",
    text: "Hébergement managé, sauvegardes, environnements de préproduction et déploiement continu.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Données protégées",
    text: "Journal d'audit, données médicales et financières cloisonnées, fichiers privés.",
  },
];

export default async function HomePage() {
  const { productName, tagline, supportEmail } = await getBranding();

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="focus:bg-card sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label={`${productName} — accueil`}>
            <Logo name={productName} />
          </Link>
          <nav
            aria-label="Navigation principale"
            className="text-muted-foreground hidden items-center gap-6 text-sm font-medium md:flex"
          >
            <a href="#fonctionnalites" className="hover:text-foreground transition-colors">
              Fonctionnalités
            </a>
            <a href="#espaces" className="hover:text-foreground transition-colors">
              Espaces
            </a>
            <a href="#assistant" className="hover:text-foreground transition-colors">
              Assistant IA
            </a>
            <a href="#securite" className="hover:text-foreground transition-colors">
              Sécurité
            </a>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild size="sm" className="h-9 px-4">
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="contenu" className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_10%_-10%,#E8F6ED,transparent),radial-gradient(40rem_20rem_at_90%_0%,#F5C5421f,transparent)] dark:bg-[radial-gradient(60rem_30rem_at_10%_-10%,#16834A26,transparent)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <div className="animate-fade-up space-y-6">
              <span className="bg-card text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm">
                <SparklesIcon className="text-highlight size-3.5" aria-hidden /> {tagline}
              </span>
              <h1 className="text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Toute la vie de votre établissement, <span className="text-primary">au même endroit.</span>
              </h1>
              <p className="text-muted-foreground max-w-xl text-lg text-pretty">
                {productName} réunit la gestion administrative, pédagogique, financière et humaine des écoles
                maternelles, primaires, collèges et lycées — avec un assistant IA qui respecte strictement les droits
                d&apos;accès.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">
                    Accéder à mon espace <ArrowRightIcon />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={`mailto:${supportEmail}?subject=Demande%20de%20d%C3%A9monstration`}>
                    Demander une démonstration
                  </a>
                </Button>
              </div>
              <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {["Public & privé", "Maternelle → Lycée", "Mobile Money", "Mode sombre"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <CheckCircle2Icon className="text-primary size-4" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="fonctionnalites" className="bg-card/50 scroll-mt-20 border-t py-20">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-primary text-sm font-semibold tracking-wider uppercase">Modules</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Une plateforme complète, pas une collection d&apos;outils
              </h2>
              <p className="text-muted-foreground mt-3">
                Chaque module partage les mêmes données, les mêmes permissions et le même journal d&apos;audit.
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.06}>
                  <div className="group bg-card hover:border-primary/30 h-full rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                    <div className="bg-brand-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground dark:bg-secondary mb-4 inline-flex size-11 items-center justify-center rounded-xl transition-colors">
                      <f.icon className="size-5" aria-hidden />
                    </div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="text-muted-foreground mt-1.5 text-sm">{f.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="espaces" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mb-12 max-w-2xl">
              <p className="text-primary text-sm font-semibold tracking-wider uppercase">Espaces utilisateurs</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Chacun voit ce qui le concerne. Rien de plus.
              </h2>
              <p className="text-muted-foreground mt-3">
                Un tableau de bord par rôle, des permissions par établissement, classe, matière et lien familial.
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SPACES.map((s, i) => (
                <Reveal key={s.role} delay={(i % 3) * 0.06}>
                  <div className="bg-card flex h-full gap-4 rounded-2xl border p-5">
                    <div className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                      <s.icon className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-semibold">{s.role}</h3>
                      <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                        {s.items.map((it) => (
                          <li key={it} className="flex items-center gap-2">
                            <span className="bg-highlight size-1.5 rounded-full" aria-hidden /> {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="assistant" className="scroll-mt-20 px-4 py-6">
          <div className="bg-brand-deep mx-auto max-w-6xl overflow-hidden rounded-3xl text-white">
            <div className="grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-2">
              <Reveal className="space-y-5">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                  <SparklesIcon className="text-highlight size-3.5" aria-hidden /> Assistant IA
                </span>
                <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                  Posez vos questions, obtenez des réponses fondées sur vos données.
                </h2>
                <p className="text-white/80">
                  L&apos;assistant n&apos;a jamais d&apos;accès libre à la base : il utilise des outils métier contrôlés
                  qui vérifient votre identité, votre rôle et votre périmètre. S&apos;il ne trouve pas une information,
                  il le dit — il n&apos;invente ni note, ni facture, ni statistique.
                </p>
                <ul className="space-y-2 text-sm text-white/85">
                  {[
                    "Mêmes permissions que l'interface",
                    "Contexte minimal transmis au modèle",
                    "Actions sensibles soumises à confirmation",
                    "Utilisation journalisée",
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <CheckCircle2Icon className="text-highlight size-4" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.1}>
                <div
                  className="space-y-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 sm:p-5"
                  aria-label="Exemple de conversation (illustratif)"
                >
                  <div className="bg-highlight ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium text-[#2a2100]">
                    Quels élèves de mes classes ont accumulé le plus d&apos;absences ce mois-ci ?
                  </div>
                  <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-white/10 px-4 py-3 text-sm leading-relaxed">
                    D&apos;après les appels enregistrés dans vos classes, trois élèves dépassent 4 absences non
                    justifiées. Je peux préparer un brouillon de message aux familles — il ne sera envoyé qu&apos;après
                    votre confirmation.
                  </div>
                  <p className="text-[11px] text-white/60">Exemple illustratif — aucune donnée réelle.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="securite" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-primary text-sm font-semibold tracking-wider uppercase">Avantages</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Conçue pour durer et pour protéger</h2>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ADVANTAGES.map((a, i) => (
                <Reveal key={a.title} delay={i * 0.05}>
                  <div className="bg-card h-full rounded-2xl border p-5 text-center">
                    <a.icon className="text-primary mx-auto mb-3 size-8" aria-hidden />
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-muted-foreground mt-1.5 text-sm">{a.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal className="bg-card mt-14 flex flex-col items-center gap-4 rounded-3xl border p-8 text-center sm:p-12">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Prêt à moderniser votre établissement ?</h2>
              <p className="text-muted-foreground max-w-xl">
                Les comptes sont créés par invitation de l&apos;établissement : aucun rôle privilégié ne peut être
                choisi librement.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">Se connecter</Link>
                </Button>
                <Button asChild size="lg" variant="highlight">
                  <a href={`mailto:${supportEmail}`}>Contacter l&apos;équipe</a>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div className="space-y-3">
            <Logo name={productName} />
            <p className="text-muted-foreground text-sm">{tagline}.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Informations légales</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <Link href="/legal/mentions" className="hover:text-foreground">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/legal/confidentialite" className="hover:text-foreground">
                  Politique de confidentialité
                </Link>
              </li>
              <li>
                <Link href="/legal/conditions" className="hover:text-foreground">
                  Conditions d&apos;utilisation
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Contact</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <a href={`mailto:${supportEmail}`} className="hover:text-foreground">
                  {supportEmail}
                </a>
              </li>
              <li>Les visuels et chiffres de cette page sont illustratifs.</li>
            </ul>
          </div>
        </div>
        <div className="text-muted-foreground border-t py-4 text-center text-xs">
          © <CurrentYear /> {productName}. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}

async function CurrentYear() {
  "use cache";
  return <>{new Date().getFullYear()}</>;
}
