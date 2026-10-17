import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProfileForm, SignOutEverywhereButton } from "@/features/settings/profile-forms";
import { formatDateTime } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Mon profil" };

const EVENTS: Record<string, string> = {
  login_success: "Connexion réussie",
  login_failure: "Échec de connexion",
  logout: "Déconnexion",
  password_reset_requested: "Demande de réinitialisation",
  password_changed: "Mot de passe modifié",
  locked_out: "Blocage temporaire (trop de tentatives)",
  session_revoked: "Sessions fermées",
};

export default async function ProfilePage() {
  const ctx = await requireContext();
  const [{ data: profile }, { data: events }] = await Promise.all([
    ctx.db.from("profiles").select("full_name, phone, email").eq("id", ctx.user.id).maybeSingle(),
    ctx.db.from("login_events").select("id, event, user_agent, created_at").eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(15),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Mon profil" description={ctx.user.email} />
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
          <CardDescription>Rôles : {ctx.school.roles.map((r) => r.name).join(", ")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-primary" aria-hidden /> Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/auth/set-password?next=/app/profile">
              <KeyRoundIcon /> Changer mon mot de passe
            </Link>
          </Button>
          <SignOutEverywhereButton />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Historique des connexions importantes</CardTitle>
          <CardDescription>Si une activité vous semble suspecte, changez votre mot de passe et fermez toutes vos sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Événement</TH>
                <TH className="hidden sm:table-cell">Appareil</TH>
              </TR>
            </THead>
            <TBody>
              {(events ?? []).map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">{formatDateTime(e.created_at)}</TD>
                  <TD>
                    <Badge variant={e.event === "login_failure" || e.event === "locked_out" ? "danger" : "muted"}>{EVENTS[e.event] ?? e.event}</Badge>
                  </TD>
                  <TD className="hidden max-w-xs truncate text-xs text-muted-foreground sm:table-cell">{e.user_agent}</TD>
                </TR>
              ))}
              {(events ?? []).length === 0 && (
                <TR>
                  <TD colSpan={3} className="text-muted-foreground">
                    Aucun événement enregistré.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
