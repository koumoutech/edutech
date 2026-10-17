import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const appName = publicEnv.NEXT_PUBLIC_APP_NAME;

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: { default: `${appName} — Gestion scolaire intelligente`, template: `%s · ${appName}` },
  description:
    "Plateforme SaaS de gestion scolaire : élèves, notes, présences, finances, communication et assistant IA respectueux des droits d'accès.",
  applicationName: appName,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16834A" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1411" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
