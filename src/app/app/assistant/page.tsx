import { MessageSquarePlusIcon, ShieldCheckIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { deleteConversationAction } from "@/features/assistant/actions";
import { AssistantChat } from "@/features/assistant/chat";
import { canSchoolWide } from "@/lib/authz";
import { cn, formatDateTime } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { assistantStatus, listConversations, loadConversation } from "@/server/services/assistant";

export const metadata: Metadata = { title: "Assistant IA" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const ctx = await requirePermission("ai.use");
  const status = assistantStatus();
  const { c } = await searchParams;

  if (!status.configured) {
    return (
      <div className="space-y-5">
        <PageHeader title="Assistant IA" />
        <EmptyState
          icon={SparklesIcon}
          title="L'assistant IA n'est pas activé"
          description={
            canSchoolWide(ctx, "school.manage")
              ? "L'administrateur de la plateforme doit configurer AI_PROVIDER=anthropic et une clé ANTHROPIC_API_KEY côté serveur (voir documentation/assistant-ia.md). Aucune donnée n'est envoyée tant que l'assistant est désactivé."
              : "Cette fonctionnalité n'est pas encore disponible dans votre établissement."
          }
        />
      </div>
    );
  }

  const isUuid = c && /^[0-9a-f-]{36}$/i.test(c);
  const [conversations, current] = await Promise.all([
    listConversations(ctx),
    isUuid ? loadConversation(ctx, c) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assistant IA"
        description="Questions sur vos données scolaires, synthèses et brouillons — dans la limite exacte de vos droits."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/assistant">
              <MessageSquarePlusIcon /> Nouvelle conversation
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <AssistantChat
          key={current?.id ?? "new"}
          conversationId={current?.id ?? null}
          initialMessages={current?.messages ?? []}
          initialStudents={current?.students ?? {}}
          allowPersonalData={status.allowPersonalData}
        />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Conversations récentes</CardTitle>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune conversation.</p>
              ) : (
                <ul className="space-y-1">
                  {conversations.map((cv) => (
                    <li
                      key={cv.id}
                      className={cn(
                        "group hover:bg-accent flex items-center gap-1 rounded-lg px-2 py-1.5",
                        cv.id === current?.id && "bg-accent",
                      )}
                    >
                      <Link href={`/app/assistant?c=${cv.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{cv.title}</span>
                        <span className="text-muted-foreground block text-xs">{formatDateTime(cv.updated_at)}</span>
                      </Link>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={`Supprimer « ${cv.title} »`}>
                            <Trash2Icon />
                          </Button>
                        }
                        title="Supprimer cette conversation ?"
                        description="L'historique de la conversation sera définitivement effacé."
                        tone="destructive"
                        confirmLabel="Supprimer"
                        action={deleteConversationAction.bind(null, cv.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Alert tone="info" title="Confidentialité">
            <span className="flex gap-2">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                L&apos;assistant utilise des outils contrôlés qui appliquent vos permissions. Il ne modifie aucune
                donnée : les brouillons doivent être confirmés.
                {status.allowPersonalData
                  ? " Les noms d'élèves peuvent être transmis au fournisseur d'IA (accord de traitement en place)."
                  : " Les élèves sont pseudonymisés avant envoi au fournisseur d'IA."}
              </span>
            </span>
          </Alert>
        </div>
      </div>
    </div>
  );
}
