import { MegaphoneIcon, PinIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { AnnouncementActions } from "@/features/communication/announcement-actions";
import { saveAnnouncementAction } from "@/features/communication/actions";
import { can, canSchoolWide } from "@/lib/authz";
import { formatDateTime } from "@/lib/utils";
import { requireContext } from "@/server/auth/session";
import { getCurrentYear } from "@/server/repositories/academic";
import { listAnnouncements } from "@/server/services/communication";

export const metadata: Metadata = { title: "Annonces" };

export default async function AnnouncementsPage() {
  const ctx = await requireContext();
  if (!can(ctx, "announcements.read") && !can(ctx, "announcements.create")) redirect("/app/forbidden");
  const items = await listAnnouncements(ctx);
  const author = canSchoolWide(ctx, "announcements.create");
  const year = author ? await getCurrentYear(ctx.db, ctx.school.id) : null;
  const [roles, classes] = author
    ? await Promise.all([
        ctx.db.from("roles").select("key, name").eq("school_id", ctx.school.id).order("name"),
        year ? ctx.db.from("classes").select("id, name").eq("academic_year_id", year.id).order("name") : null,
      ])
    : [null, null];
  const roleNames = new Map((roles?.data ?? []).map((r) => [r.key, r.name]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Annonces"
        description="Communications officielles de l'établissement, ciblées par rôle ou par classe."
        actions={
          author && (
            <FormDialog title="Nouvelle annonce" action={saveAnnouncementAction} triggerLabel="Nouvelle annonce">
              <Field label="Titre" htmlFor="an-title">
                <Input id="an-title" name="title" required minLength={3} maxLength={160} />
              </Field>
              <Field label="Message" htmlFor="an-body">
                <Textarea id="an-body" name="body" required rows={6} maxLength={10000} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priorité" htmlFor="an-prio">
                  <Select id="an-prio" name="priority" defaultValue="normal">
                    <option value="normal">Normale</option>
                    <option value="important">Importante</option>
                    <option value="urgent">Urgente</option>
                  </Select>
                </Field>
                <Field label="Expire le" htmlFor="an-exp">
                  <Input id="an-exp" name="expires_at" type="date" />
                </Field>
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Public (aucune case = tout l&apos;établissement)</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {(roles?.data ?? []).map((r) => (
                    <label key={r.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="audience_roles"
                        value={r.key}
                        className="size-4 accent-[var(--primary)]"
                      />{" "}
                      {r.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              {(classes?.data ?? []).length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium">Classes ciblées (facultatif)</legend>
                  <div className="flex flex-wrap gap-2">
                    {(classes?.data ?? []).map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm">
                        <input
                          type="checkbox"
                          name="audience_class_ids"
                          value={c.id}
                          className="size-3.5 accent-[var(--primary)]"
                        />{" "}
                        {c.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_pinned" className="size-4 accent-[var(--primary)]" /> Épingler en haut
              </label>
              {canSchoolWide(ctx, "announcements.publish") && (
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" name="publish" className="size-4 accent-[var(--primary)]" /> Publier
                  immédiatement
                </label>
              )}
            </FormDialog>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} title="Aucune annonce" />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card
              key={a.id}
              className={
                a.priority === "urgent"
                  ? "border-destructive/40"
                  : a.priority === "important"
                    ? "border-highlight/60"
                    : ""
              }
            >
              <article className="space-y-2 p-4 sm:p-5">
                <header className="flex flex-wrap items-start gap-2">
                  {a.is_pinned && <PinIcon className="text-primary size-4" aria-label="Épinglée" />}
                  <h2 className="flex-1 font-semibold">{a.title}</h2>
                  {a.priority !== "normal" && (
                    <Badge variant={a.priority === "urgent" ? "danger" : "warning"}>
                      {a.priority === "urgent" ? "Urgent" : "Important"}
                    </Badge>
                  )}
                  {author && a.status !== "published" && (
                    <Badge variant="muted">{a.status === "draft" ? "Brouillon" : "Archivée"}</Badge>
                  )}
                  {author && (
                    <AnnouncementActions
                      id={a.id}
                      status={a.status}
                      canPublish={canSchoolWide(ctx, "announcements.publish")}
                    />
                  )}
                </header>
                <p className="text-muted-foreground text-sm whitespace-pre-line">{a.body}</p>
                <footer className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                  <span>
                    {a.published_at
                      ? `Publiée le ${formatDateTime(a.published_at)}`
                      : `Créée le ${formatDateTime(a.created_at)}`}
                  </span>
                  {author && (
                    <span>
                      · Public :{" "}
                      {a.audience_roles.length
                        ? a.audience_roles.map((k) => roleNames.get(k) ?? k).join(", ")
                        : "tout l'établissement"}
                    </span>
                  )}
                </footer>
              </article>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
