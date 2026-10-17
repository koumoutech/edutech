"use client";

import { Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitation({ token, isNew }: { token: string; isNew: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitationAction(token, isNew);
            if (res && !res.ok) setError(res.error);
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />} Accepter l&apos;invitation
      </Button>
    </div>
  );
}
