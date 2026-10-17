"use client";

import { CopyIcon, MailPlusIcon, PauseCircleIcon, PlayCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/action-dialog";
import { SubmitButton } from "@/components/form-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/misc";
import { assignRoleAction, inviteUserAction, removeRoleAction, revokeInvitationAction, setMemberStatusAction } from "./actions";

export function InviteDialog({
  roles,
  links,
}: {
  roles: { id: string; name: string; is_privileged: boolean }[];
  links: { kind: "student" | "guardian" | "staff"; id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(inviteUserAction, null);
  const [kind, setKind] = useState("");
  useEffect(() => {
    if (state && !state.ok) toast.error(state.error);
  }, [state]);
  const result = state?.ok ? (state.data as { link: string; delivered: boolean }) : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MailPlusIcon /> Inviter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Inviter un utilisateur</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {result ? (
              <div className="space-y-3">
                <Alert tone="success" title="Invitation créée">
                  {result.delivered ? "Un e-mail a été envoyé." : "Envoi d'e-mail non configuré : transmettez le lien ci-dessous."} Le lien est valable 7 jours et ne fonctionne
                  qu&apos;avec l&apos;adresse invitée.
                </Alert>
                <div className="flex gap-2">
                  <Input readOnly value={result.link} aria-label="Lien d'invitation" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copier le lien"
                    onClick={() => navigator.clipboard.writeText(result.link).then(() => toast.success("Lien copié."))}
                  >
                    <CopyIcon />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Field label="Adresse e-mail" htmlFor="i-email">
                  <Input id="i-email" name="email" type="email" required />
                </Field>
                <Field label="Rôle" htmlFor="i-role" hint="Les rôles privilégiés ne peuvent être attribués que par un administrateur.">
                  <Select id="i-role" name="role_id" required>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.is_privileged ? " (privilégié)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Relier à une fiche existante" htmlFor="i-kind" hint="Indispensable pour un parent, un élève ou un enseignant.">
                  <Select id="i-kind" name="link_kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                    <option value="">Aucune</option>
                    <option value="guardian">Responsable légal (parent)</option>
                    <option value="student">Élève</option>
                    <option value="staff">Membre du personnel</option>
                  </Select>
                </Field>
                {kind && (
                  <Field label="Fiche" htmlFor="i-link">
                    <Select id="i-link" name="link_id" required>
                      {links
                        .filter((l) => l.kind === kind)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                    </Select>
                  </Field>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            {!result && <SubmitButton pendingLabel="Création…">Créer l&apos;invitation</SubmitButton>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MemberActions({
  userId,
  name,
  status,
  roles,
  memberRoles,
  isSelf,
}: {
  userId: string;
  name: string;
  status: string;
  roles: { id: string; name: string }[];
  memberRoles: { id: string; name: string }[];
  isSelf: boolean;
}) {
  if (isSelf) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {memberRoles.map((r) => (
        <ConfirmDialog
          key={r.id}
          trigger={
            <Button size="sm" variant="ghost" aria-label={`Retirer le rôle ${r.name}`}>
              <XIcon /> {r.name}
            </Button>
          }
          title={`Retirer le rôle « ${r.name} » à ${name} ?`}
          tone="destructive"
          action={() => removeRoleAction(userId, r.id)}
        />
      ))}
      <ConfirmDialog
        trigger={
          <Button size="icon-sm" variant="outline" aria-label="Ajouter un rôle">
            <PlusIcon />
          </Button>
        }
        title={`Ajouter un rôle à ${name}`}
        action={(r, fd) => assignRoleAction(userId, r, fd)}
      >
        <Field label="Rôle" htmlFor={`ar-${userId}`}>
          <Select id={`ar-${userId}`} name="role_id">
            {roles
              .filter((r) => !memberRoles.some((m) => m.id === r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </Select>
        </Field>
      </ConfirmDialog>
      {status === "active" ? (
        <ConfirmDialog
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Suspendre">
              <PauseCircleIcon />
            </Button>
          }
          title={`Suspendre ${name} ?`}
          description="L'accès est coupé immédiatement et toutes ses sessions sont fermées. Les données sont conservées."
          tone="destructive"
          confirmLabel="Suspendre"
          reason={{ label: "Motif", minLength: 3 }}
          action={(reason) => setMemberStatusAction(userId, "suspended", reason)}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Réactiver">
              <PlayCircleIcon />
            </Button>
          }
          title={`Réactiver ${name} ?`}
          action={() => setMemberStatusAction(userId, "active", "")}
        />
      )}
    </div>
  );
}

export function RevokeInvitationButton({ id }: { id: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost">
          Révoquer
        </Button>
      }
      title="Révoquer l'invitation ?"
      tone="destructive"
      action={() => revokeInvitationAction(id)}
    />
  );
}
