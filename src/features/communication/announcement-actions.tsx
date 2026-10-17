"use client";

import { ArchiveIcon, SendIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { archiveAnnouncementAction, publishAnnouncementAction } from "./actions";

export function AnnouncementActions({ id, status, canPublish }: { id: string; status: string; canPublish: boolean }) {
  return (
    <div className="flex gap-1">
      {status === "draft" && canPublish && (
        <ConfirmDialog
          trigger={
            <Button size="sm">
              <SendIcon /> Publier
            </Button>
          }
          title="Publier l'annonce ?"
          description="Le public ciblé recevra une notification (e-mail selon ses préférences)."
          action={() => publishAnnouncementAction(id)}
        />
      )}
      {status !== "archived" && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="ghost" aria-label="Archiver">
              <ArchiveIcon />
            </Button>
          }
          title="Archiver l'annonce ?"
          action={() => archiveAnnouncementAction(id)}
        />
      )}
    </div>
  );
}
