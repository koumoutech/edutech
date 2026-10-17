"use client";

import { BellIcon, CalendarCheckIcon, SparklesIcon, TrendingUpIcon, WalletIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "@/components/ui/motion";

const bars = [42, 58, 51, 67, 72, 64, 81];

/**
 * Illustrative composition of the dashboards. All figures shown here are FICTITIOUS
 * and labelled as such for visitors.
 */
export function HeroVisual() {
  const reduced = useReducedMotion();
  const float = (delay: number) =>
    reduced ? {} : { animate: { y: [0, -6, 0] }, transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const, delay } };

  return (
    <div className="relative mx-auto w-full max-w-xl" aria-label="Aperçu illustratif des tableaux de bord (données fictives)">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_30%_20%,#16834A33,transparent_60%),radial-gradient(circle_at_80%_70%,#F5C54233,transparent_55%)] blur-2xl" />
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border bg-card p-4 shadow-[var(--shadow-lift)] sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Tableau de bord — Direction</p>
            <p className="font-semibold">Vue d&apos;ensemble du trimestre</p>
          </div>
          <span className="rounded-full bg-highlight/25 px-2 py-0.5 text-[10px] font-semibold text-[#7a5b00] dark:text-highlight">
            Données fictives
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Élèves", value: 1248, icon: TrendingUpIcon },
            { label: "Présence", value: 96, suffix: " %", icon: CalendarCheckIcon },
            { label: "Recouvrement", value: 87, suffix: " %", icon: WalletIcon },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-muted/70 p-2.5 sm:p-3">
              <k.icon className="mb-1.5 size-4 text-primary" aria-hidden />
              <p className="text-lg font-bold sm:text-xl">
                <AnimatedNumber value={k.value} />
                {k.suffix}
              </p>
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Moyenne générale par semaine</p>
          <div className="flex h-24 items-end gap-1.5 sm:gap-2">
            {bars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className={i === bars.length - 1 ? "flex-1 rounded-md bg-highlight" : "flex-1 rounded-md bg-primary/80"}
              />
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        {...float(0)}
        className="absolute -top-5 -left-3 hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-[var(--shadow-lift)] sm:flex"
      >
        <BellIcon className="size-4 text-primary" aria-hidden />
        <span className="text-xs font-medium">Bulletin publié · 6e A</span>
      </motion.div>
      <motion.div
        {...float(1.2)}
        className="absolute -right-3 -bottom-6 flex max-w-[16rem] items-start gap-2 rounded-xl border bg-card px-3 py-2.5 shadow-[var(--shadow-lift)]"
      >
        <SparklesIcon className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
        <span className="text-xs leading-snug">
          <span className="font-semibold">Assistant IA :</span> « 3 élèves de 5e A cumulent plus de 4 absences ce mois-ci. »
        </span>
      </motion.div>
    </div>
  );
}
