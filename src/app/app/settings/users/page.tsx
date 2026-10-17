import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, PageHeader } from "@/components/ui/misc";
import { InviteDialog, MemberActions, RevokeInvitationButton } from "@/features/settings/user-actions";
import { canSchoolWide } from "@/lib/authz";
import { formatDate, fullName } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { listMembers } from "@/server/services/admin";

export const metadata: Metadata = { title: "Utilisateurs & invitations" };

export default async function UsersPage() {
  const ctx = await requirePermission("users.read");
  const { members, roles, invitations } = await listMembers(ctx);
  const canInvite = canSchoolWide(ctx, "users.create");
  const canManage = canSchoolWide(ctx, "users.manage");
  const grantable = roles.filter((r) => !r.is_privileged || canSchoolWide(ctx, "roles.manage"));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));

  const links = canInvite
    ? await Promise.all([
        ctx.db.from("guardians").select("id, first_name, last_name, email").eq("school_id", ctx.school.id).is("user_id", null).order("last_name").limit(1000),
        ctx.db.from("students").select("id, first_name, last_name, matricule").eq("school_id", ctx.school.id).is("user_id", null).eq("status", "active").order("last_name").limit(1000),
        ctx.db.from("staff_members").select("id, first_name, last_name, job_title").eq("school_id", ctx.school.id).is("user_id", null).order("last_name"),
      ]).then(([g, s, st]) => [
        ...(g.data ?? []).map((x) => ({ kind: "guardian" as const, id: x.id, label: `${fullName(x)}${x.email ? ` — ${x.email}` : ""}` })),
        ...(s.data ?? []).map((x) => ({ kind: "student" as const, id: x.id, label: `${fullName(x)} — ${x.matricule}` })),
        ...(st.data ?? []).map((x) => ({ kind: "staff" as const, id: x.id, label: `${fullName(x)} — ${x.job_title}` })),
      ])
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Utilisateurs & invitations"
        description="Aucun compte ne peut s'attribuer lui-même un rôle : l'accès se fait uniquement sur invitation."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/settings/roles">Rôles & permissions</Link>
            </Button>
            {canInvite && <InviteDialog roles={grantable} links={links} />}
          </>
        }
      />
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations en attente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1 font-medium">{i.email}</span>
                  <Badge variant="muted">{roleName.get(i.role_id)}</Badge>
                  <span className="text-xs text-muted-foreground">expire le {formatDate(i.expires_at)}</span>
                  {canInvite && <RevokeInvitationButton id={i.id} />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card className="divide-y">
        {members.map((m) => (
          <div key={m.user_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={m.name} />
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {m.name} {m.status !== "active" && <Badge variant="danger">Suspendu</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                {!canManage && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r.id} variant="muted">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {canManage && <MemberActions userId={m.user_id} name={m.name} status={m.status} roles={grantable} memberRoles={m.roles} isSelf={m.user_id === ctx.user.id} />}
          </div>
        ))}
      </Card>
    </div>
  );
}
