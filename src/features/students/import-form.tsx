"use client";

import { CheckCircle2Icon, DownloadIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/form-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { confirmImportAction, previewImportAction } from "./actions";
import { IMPORT_COLUMNS } from "./import";

export function ImportForm() {
  const [state, action] = useActionState(previewImportAction, null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ imported: number; failed: { line: number; error?: string }[] } | null>(null);
  const router = useRouter();
  const preview = state?.ok ? state.data : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>1. Préparer le fichier</CardTitle>
          <CardDescription>
            Format CSV (séparateur « ; » ou « , »), encodage UTF-8, une ligne par élève, 1 000 lignes maximum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {IMPORT_COLUMNS.map((c) => (
              <code key={c.key} className={`rounded-md px-2 py-0.5 text-xs ${c.required ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {c.label}
              </code>
            ))}
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export/students-template" download>
              <DownloadIcon /> Télécharger le modèle
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Vérifier</CardTitle>
          <CardDescription>Le fichier est entièrement contrôlé avant tout enregistrement.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-3 sm:flex-row">
            <Input name="file" type="file" accept=".csv,text/csv" required className="pt-1.5" />
            <SubmitButton variant="secondary" pendingLabel="Analyse…">
              <UploadIcon /> Analyser
            </SubmitButton>
          </form>
          {state && !state.ok && <Alert tone="danger" className="mt-3">{state.error}</Alert>}
        </CardContent>
      </Card>

      {preview && !done && (
        <Card>
          <CardHeader>
            <CardTitle>3. Résultat de l&apos;analyse</CardTitle>
            <CardDescription>
              {preview.totalLines} ligne(s) lue(s) · {preview.rows.length} valide(s) · {preview.errors.length} en erreur
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.errors.length > 0 ? (
              <>
                <Alert tone="danger" title="Corrigez ces lignes puis analysez à nouveau le fichier">
                  Aucun élève ne sera importé tant que le fichier contient des erreurs.
                </Alert>
                <Table>
                  <THead>
                    <TR>
                      <TH>Ligne</TH>
                      <TH>Problème</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {preview.errors.slice(0, 200).map((e) => (
                      <TR key={e.line}>
                        <TD className="tabular-nums">{e.line}</TD>
                        <TD>{e.message}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            ) : (
              <>
                <Alert tone="success">Fichier valide : {preview.rows.length} élève(s) prêt(s) à être importé(s).</Alert>
                <Button
                  disabled={pending || !preview.csv}
                  onClick={() =>
                    start(async () => {
                      const res = await confirmImportAction(preview.csv!);
                      if (!res.ok) toast.error(res.error);
                      else setDone(res.data);
                    })
                  }
                >
                  {pending && <Loader2Icon className="animate-spin" />} Importer {preview.rows.length} élève(s)
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {done && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2Icon className="text-primary" /> {done.imported} élève(s) importé(s).
            </p>
            {done.failed.length > 0 && (
              <Alert tone="warning" title={`${done.failed.length} ligne(s) refusée(s) par le serveur`}>
                <ul className="list-disc pl-5">
                  {done.failed.map((f) => (
                    <li key={f.line}>
                      Ligne {f.line} : {f.error}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            <Button onClick={() => router.push("/app/students")}>Voir la liste des élèves</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
