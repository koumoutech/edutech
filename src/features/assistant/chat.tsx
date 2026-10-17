"use client";

import { MegaphoneIcon, SendIcon, SparklesIcon, UserIcon, WrenchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";
import type { AssistantProposal } from "@/server/ai/tools";
import type { ChatMessageView } from "@/server/services/assistant";
import { askAssistantAction, saveAssistantDraftAction } from "./actions";
import { RichText } from "./rich-text";

const TOOL_LABELS: Record<string, string> = {
  list_pending_tasks: "Tâches en attente",
  get_enrollment_summary: "Effectifs",
  get_grades_summary: "Moyennes",
  get_students_at_risk: "Élèves en difficulté",
  get_attendance_summary: "Présences",
  get_finance_summary: "Finances",
  get_incomplete_student_files: "Dossiers incomplets",
  propose_announcement_draft: "Brouillon d'annonce",
  list_accessible_pages: "Navigation",
};

const SUGGESTIONS = [
  "Qu'est-ce qui attend mon action aujourd'hui ?",
  "Quels élèves sont en difficulté ce trimestre ?",
  "Fais le point sur les absences des 30 derniers jours.",
  "Rédige une annonce pour la réunion parents-professeurs.",
];

interface Props {
  conversationId: string | null;
  initialMessages: ChatMessageView[];
  initialStudents: Record<string, string | null>;
  allowPersonalData: boolean;
}

export function AssistantChat({
  conversationId: initialId,
  initialMessages,
  initialStudents,
  allowPersonalData,
}: Props) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [students, setStudents] = useState(initialStudents);
  const [proposals, setProposals] = useState<AssistantProposal[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  function send(text: string) {
    const message = text.trim();
    if (message.length < 2 || pending) return;
    setDraft("");
    setProposals([]);
    seq.current += 1;
    const optimistic: ChatMessageView = {
      id: `tmp-${seq.current}`,
      role: "user",
      content: message,
      toolsUsed: [],
      createdAt: "",
    };
    setMessages((m) => [...m, optimistic]);
    start(async () => {
      const res = await askAssistantAction(conversationId, message);
      if (!res.ok) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setDraft(message);
        toast.error(res.error);
        return;
      }
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), ...res.data.messages]);
      setStudents((s) => ({ ...s, ...res.data.students }));
      setProposals(res.data.proposals);
      if (!conversationId) {
        setConversationId(res.data.conversationId);
        router.replace(`/app/assistant?c=${res.data.conversationId}`, { scroll: false });
      }
    });
  }

  return (
    <div className="bg-card flex min-h-[60vh] flex-col rounded-2xl border">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-4 py-6 text-center">
            <SparklesIcon className="text-primary mx-auto size-8" aria-hidden />
            <p className="text-muted-foreground text-sm">
              Posez une question sur votre établissement. L&apos;assistant ne consulte que les données auxquelles vous
              avez accès.
            </p>
            <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="bg-background hover:bg-accent rounded-xl border px-3 py-2 text-left text-sm transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                m.role === "user"
                  ? "bg-muted"
                  : "bg-brand-soft text-brand-deep dark:bg-secondary dark:text-secondary-foreground",
              )}
              aria-hidden
            >
              {m.role === "user" ? <UserIcon className="size-4" /> : <SparklesIcon className="size-4" />}
            </div>
            <div
              className={cn(
                "max-w-[85%] space-y-2 rounded-2xl px-4 py-3",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60",
              )}
            >
              <span className="sr-only">{m.role === "user" ? "Vous :" : "Assistant :"}</span>
              {m.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              ) : (
                <RichText text={m.content} students={students} />
              )}
              {m.toolsUsed.length > 0 && (
                <div className="text-muted-foreground flex flex-wrap items-center gap-1 pt-1 text-xs">
                  <WrenchIcon className="size-3" aria-hidden /> Sources :
                  {m.toolsUsed.map((t) => (
                    <Badge key={t} variant="muted">
                      {TOOL_LABELS[t] ?? t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="text-muted-foreground flex items-center gap-3 text-sm" role="status">
            <SparklesIcon className="text-primary size-4 animate-pulse motion-reduce:animate-none" aria-hidden />{" "}
            L&apos;assistant consulte les données…
          </div>
        )}
        {proposals.map((p, i) => (
          <DraftProposal
            key={`${p.title}-${i}`}
            proposal={p}
            onDone={() => setProposals((all) => all.filter((x) => x !== p))}
          />
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="space-y-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="ai-input" className="sr-only">
            Votre question
          </label>
          <Textarea
            id="ai-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Ex. : Quelle est la moyenne des classes ce trimestre ?"
            className="min-h-12 resize-none"
            disabled={pending}
          />
          <Button type="submit" size="icon" disabled={pending || draft.trim().length < 2} aria-label="Envoyer">
            <SendIcon />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Les réponses s&apos;appuient uniquement sur vos données autorisées et peuvent comporter des erreurs : vérifiez
          avant toute décision.
          {!allowPersonalData &&
            " Les noms des élèves ne sont pas transmis au fournisseur d'IA ; évitez de les saisir."}
        </p>
      </form>
    </div>
  );
}

function DraftProposal({ proposal, onDone }: { proposal: AssistantProposal; onDone: () => void }) {
  const [title, setTitle] = useState(proposal.title);
  const [body, setBody] = useState(proposal.body);
  const [pending, start] = useTransition();
  return (
    <div className="border-highlight/50 bg-highlight/10 space-y-3 rounded-2xl border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MegaphoneIcon className="size-4" aria-hidden /> Brouillon d&apos;annonce proposé — non enregistré
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Titre de l'annonce"
        maxLength={160}
        className="bg-background w-full rounded-lg border px-3 py-2 text-sm font-medium"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Texte de l'annonce"
        rows={6}
        maxLength={5000}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveAssistantDraftAction({ title, body, priority: proposal.priority });
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(res.message ?? "Brouillon enregistré.");
              onDone();
            })
          }
        >
          Enregistrer comme brouillon
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={pending}>
          Ignorer
        </Button>
        <Button size="sm" variant="link" asChild>
          <Link href="/app/announcements">Voir les annonces</Link>
        </Button>
      </div>
    </div>
  );
}
