"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useFieldArray, useForm, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { createStudentSchema, RELATIONSHIP_LABELS, studentFieldsSchema } from "@/schemas/students";
import { createStudentAction, updateStudentAction } from "./actions";

type CreateInput = z.input<typeof createStudentSchema>;
type StudentFields = z.input<typeof studentFieldsSchema>;

function err(errors: FieldErrors, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = errors;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return (cur as { message?: string } | undefined)?.message;
}

function StudentFieldsBlock({ register, errors, prefix }: { register: ReturnType<typeof useForm<CreateInput>>["register"]; errors: FieldErrors; prefix: string }) {
  const r = (name: string) => register(`${prefix}${name}` as never);
  const e = (name: string) => err(errors, `${prefix}${name}`);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Prénom" htmlFor="first_name" required error={e("first_name")}>
        <Input id="first_name" autoComplete="off" {...r("first_name")} aria-invalid={Boolean(e("first_name"))} />
      </Field>
      <Field label="Nom" htmlFor="last_name" required error={e("last_name")}>
        <Input id="last_name" autoComplete="off" {...r("last_name")} aria-invalid={Boolean(e("last_name"))} />
      </Field>
      <Field label="Sexe" htmlFor="gender" error={e("gender")}>
        <Select id="gender" {...r("gender")}>
          <option value="">—</option>
          <option value="F">Féminin</option>
          <option value="M">Masculin</option>
        </Select>
      </Field>
      <Field label="Date de naissance" htmlFor="birth_date" error={e("birth_date")}>
        <Input id="birth_date" type="date" {...r("birth_date")} />
      </Field>
      <Field label="Lieu de naissance" htmlFor="birth_place" error={e("birth_place")}>
        <Input id="birth_place" {...r("birth_place")} />
      </Field>
      <Field label="Nationalité" htmlFor="nationality" error={e("nationality")}>
        <Input id="nationality" {...r("nationality")} />
      </Field>
      <Field label="Matricule" htmlFor="matricule" hint="Laissez vide pour une génération automatique." error={e("matricule")}>
        <Input id="matricule" className="uppercase" {...r("matricule")} />
      </Field>
      <Field label="Établissement précédent" htmlFor="previous_school" error={e("previous_school")}>
        <Input id="previous_school" {...r("previous_school")} />
      </Field>
      <Field label="Téléphone" htmlFor="phone" error={e("phone")}>
        <Input id="phone" type="tel" inputMode="tel" {...r("phone")} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={e("email")}>
        <Input id="email" type="email" inputMode="email" {...r("email")} />
      </Field>
      <Field label="Adresse" htmlFor="address" className="sm:col-span-2" error={e("address")}>
        <Input id="address" {...r("address")} />
      </Field>
      <Field label="Observations" htmlFor="notes" className="sm:col-span-2" error={e("notes")}>
        <Textarea id="notes" rows={3} {...r("notes")} />
      </Field>
    </div>
  );
}

export function NewStudentForm({ classes, canEnroll }: { classes: { id: string; name: string }[]; canEnroll: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<CreateInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: {
      student: { first_name: "", last_name: "" },
      guardians: [{ first_name: "", last_name: "", relationship: "mother", is_emergency_contact: true, is_billing_contact: true }],
      class_id: "",
    },
  });
  const guardians = useFieldArray({ control: form.control, name: "guardians" });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await createStudentAction(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.push(`/app/students/${res.data.id}`);
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identité de l&apos;élève</CardTitle>
          <CardDescription>Les champs marqués d&apos;un astérisque sont obligatoires.</CardDescription>
        </CardHeader>
        <CardContent>
          <StudentFieldsBlock register={form.register} errors={errors} prefix="student." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Responsables légaux</CardTitle>
            <CardDescription>Contacts, personnes à prévenir en cas d&apos;urgence et payeurs.</CardDescription>
          </div>
          {guardians.fields.length < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => guardians.append({ first_name: "", last_name: "", relationship: "father", is_emergency_contact: false, is_billing_contact: false })}
            >
              <PlusIcon /> Ajouter
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {guardians.fields.map((f, i) => (
            <div key={f.id} className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Responsable {i + 1}</p>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => guardians.remove(i)} aria-label={`Retirer le responsable ${i + 1}`}>
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prénom" htmlFor={`g${i}-first`} required error={err(errors, `guardians.${i}.first_name`)}>
                  <Input id={`g${i}-first`} {...form.register(`guardians.${i}.first_name`)} />
                </Field>
                <Field label="Nom" htmlFor={`g${i}-last`} required error={err(errors, `guardians.${i}.last_name`)}>
                  <Input id={`g${i}-last`} {...form.register(`guardians.${i}.last_name`)} />
                </Field>
                <Field label="Lien de parenté" htmlFor={`g${i}-rel`}>
                  <Select id={`g${i}-rel`} {...form.register(`guardians.${i}.relationship`)}>
                    {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Téléphone" htmlFor={`g${i}-phone`} error={err(errors, `guardians.${i}.phone`)}>
                  <Input id={`g${i}-phone`} type="tel" inputMode="tel" {...form.register(`guardians.${i}.phone`)} />
                </Field>
                <Field label="E-mail" htmlFor={`g${i}-email`} error={err(errors, `guardians.${i}.email`)}>
                  <Input id={`g${i}-email`} type="email" {...form.register(`guardians.${i}.email`)} />
                </Field>
                <Field label="Profession" htmlFor={`g${i}-job`}>
                  <Input id={`g${i}-job`} {...form.register(`guardians.${i}.profession`)} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" {...form.register(`guardians.${i}.is_emergency_contact`)} />
                  Contact d&apos;urgence
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" {...form.register(`guardians.${i}.is_billing_contact`)} />
                  Responsable de la facturation
                </label>
              </div>
            </div>
          ))}
          {guardians.fields.length === 0 && <p className="text-sm text-muted-foreground">Aucun responsable : le dossier sera signalé comme incomplet.</p>}
        </CardContent>
      </Card>

      {canEnroll && (
        <Card>
          <CardHeader>
            <CardTitle>Affectation</CardTitle>
            <CardDescription>Inscription dans une classe de l&apos;année en cours (capacité contrôlée).</CardDescription>
          </CardHeader>
          <CardContent>
            <Field label="Classe" htmlFor="class_id">
              <Select id="class_id" {...form.register("class_id")}>
                <option value="">Ne pas affecter maintenant</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-xl border bg-card/95 p-3 backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />} Inscrire l&apos;élève
        </Button>
      </div>
    </form>
  );
}

export function EditStudentForm({ student }: { student: StudentFields & { id: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<CreateInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: { student, guardians: [] },
  });
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await updateStudentAction({ ...values.student, id: student.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.push(`/app/students/${student.id}`);
    }),
  );
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Card>
        <CardContent className="pt-5">
          <StudentFieldsBlock register={form.register} errors={form.formState.errors} prefix="student." />
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />} Enregistrer
        </Button>
      </div>
    </form>
  );
}
