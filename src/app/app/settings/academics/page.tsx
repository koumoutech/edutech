import { BookOpenIcon, CalendarRangeIcon, DoorOpenIcon, LayersIcon } from "lucide-react";
import type { Metadata } from "next";
import { FormDialog } from "@/components/inline-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form-controls";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BellScheduleEditor } from "@/features/classes/bell-schedule-editor";
import { saveLevelAction, saveRoomAction, saveSubjectAction, saveYearAction, updateTermAction } from "@/features/classes/actions";
import { can } from "@/lib/authz";
import { formatDate } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";
import { academicReferenceData } from "@/server/services/academics";

export const metadata: Metadata = { title: "Organisation pédagogique" };

export default async function AcademicSettingsPage() {
  const ctx = await requirePermission("academics.manage", ["school"]);
  const data = await academicReferenceData(ctx);

  return (
    <div className="space-y-5">
      <PageHeader title="Organisation pédagogique" description="Années scolaires, périodes, niveaux, matières, salles et horaires." />
      <Tabs defaultValue="years">
        <TabsList>
          <TabsTrigger value="years">Années & périodes</TabsTrigger>
          <TabsTrigger value="levels">Niveaux</TabsTrigger>
          <TabsTrigger value="subjects">Matières</TabsTrigger>
          <TabsTrigger value="rooms">Salles</TabsTrigger>
          {can(ctx, "timetable.manage") && <TabsTrigger value="bells">Horaires</TabsTrigger>}
        </TabsList>

        <TabsContent value="years" className="space-y-4">
          <div className="flex justify-end">
            <FormDialog title="Nouvelle année scolaire" action={saveYearAction} triggerLabel="Nouvelle année">
              <Field label="Libellé" htmlFor="y-name" hint="Exemple : 2027-2028">
                <Input id="y-name" name="name" required pattern="\d{4}-\d{4}" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Début" htmlFor="y-start">
                  <Input id="y-start" name="starts_on" type="date" required />
                </Field>
                <Field label="Fin" htmlFor="y-end">
                  <Input id="y-end" name="ends_on" type="date" required />
                </Field>
              </div>
              <Field label="Nombre de périodes" htmlFor="y-terms" hint="3 trimestres ou 2 semestres, ajustables ensuite.">
                <Input id="y-terms" name="terms" type="number" min={1} max={6} defaultValue={3} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_current" className="size-4 accent-[var(--primary)]" /> Définir comme année en cours
              </label>
            </FormDialog>
          </div>
          {data.years.length === 0 && <EmptyState icon={CalendarRangeIcon} title="Aucune année scolaire" description="Créez la première année pour configurer classes et périodes." />}
          {data.years.map((y) => (
            <Card key={y.id}>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {y.name} {y.is_current && <Badge variant="solid">En cours</Badge>}
                  </CardTitle>
                  <CardDescription>
                    Du {formatDate(y.starts_on)} au {formatDate(y.ends_on)}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TR>
                      <TH>Période</TH>
                      <TH>Début</TH>
                      <TH>Fin</TH>
                      <TH>Poids</TH>
                      <TH />
                    </TR>
                  </THead>
                  <TBody>
                    {[...(y.terms ?? [])]
                      .sort((a, b) => a.position - b.position)
                      .map((t) => (
                        <TR key={t.id}>
                          <TD className="font-medium">{t.name}</TD>
                          <TD>{formatDate(t.starts_on)}</TD>
                          <TD>{formatDate(t.ends_on)}</TD>
                          <TD>{t.weight}</TD>
                          <TD className="text-right">
                            <FormDialog title={`Modifier ${t.name}`} action={updateTermAction} trigger={<Button variant="ghost" size="sm">Modifier</Button>}>
                              <input type="hidden" name="id" value={t.id} />
                              <Field label="Libellé" htmlFor={`t-${t.id}`}>
                                <Input id={`t-${t.id}`} name="name" defaultValue={t.name} required />
                              </Field>
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="Début" htmlFor={`ts-${t.id}`}>
                                  <Input id={`ts-${t.id}`} name="starts_on" type="date" defaultValue={t.starts_on} required />
                                </Field>
                                <Field label="Fin" htmlFor={`te-${t.id}`}>
                                  <Input id={`te-${t.id}`} name="ends_on" type="date" defaultValue={t.ends_on} required />
                                </Field>
                              </div>
                              <Field label="Poids dans la moyenne annuelle" htmlFor={`tw-${t.id}`}>
                                <Input id={`tw-${t.id}`} name="weight" type="number" step="0.5" min="0.5" max="10" defaultValue={t.weight} />
                              </Field>
                            </FormDialog>
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="levels" className="space-y-4">
          <div className="flex justify-end">
            <FormDialog title="Nouveau niveau" action={saveLevelAction} triggerLabel="Nouveau niveau">
              <Field label="Nom" htmlFor="l-name">
                <Input id="l-name" name="name" required placeholder="Sixième" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Abréviation" htmlFor="l-short">
                  <Input id="l-short" name="short_name" placeholder="6e" />
                </Field>
                <Field label="Ordre" htmlFor="l-pos">
                  <Input id="l-pos" name="position" type="number" min={1} defaultValue={data.levels.length + 1} />
                </Field>
              </div>
              <Field label="Cycle" htmlFor="l-cycle" hint="Maternelle, Primaire, Collège, Lycée…">
                <Input id="l-cycle" name="cycle_name" />
              </Field>
            </FormDialog>
          </div>
          <Card>
            <CardContent className="pt-5">
              {data.levels.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Ordre</TH>
                      <TH>Niveau</TH>
                      <TH>Cycle</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.levels.map((l) => (
                      <TR key={l.id}>
                        <TD>{l.position}</TD>
                        <TD className="font-medium">
                          {l.name} {l.short_name && <span className="text-muted-foreground">({l.short_name})</span>}
                        </TD>
                        <TD>{l.cycle?.name ?? "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState icon={LayersIcon} title="Aucun niveau" className="py-8" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subjects" className="space-y-4">
          <div className="flex justify-end">
            <FormDialog title="Nouvelle matière" action={saveSubjectAction} triggerLabel="Nouvelle matière">
              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <Field label="Code" htmlFor="s-code">
                  <Input id="s-code" name="code" required className="uppercase" placeholder="MATH" />
                </Field>
                <Field label="Nom" htmlFor="s-name">
                  <Input id="s-name" name="name" required placeholder="Mathématiques" />
                </Field>
              </div>
              <Field label="Couleur" htmlFor="s-color">
                <Input id="s-color" name="color" type="color" defaultValue="#16834A" className="h-10 w-20 p-1" />
              </Field>
            </FormDialog>
          </div>
          <Card>
            <CardContent className="grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.subjects.length === 0 && <EmptyState icon={BookOpenIcon} title="Aucune matière" className="sm:col-span-3" />}
              {data.subjects.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="size-3 rounded-full" style={{ background: s.color ?? "var(--primary)" }} aria-hidden />
                  <span className="flex-1 text-sm font-medium">{s.name}</span>
                  <code className="text-xs text-muted-foreground">{s.code}</code>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <div className="flex justify-end">
            <FormDialog title="Nouvelle salle" action={saveRoomAction} triggerLabel="Nouvelle salle">
              <Field label="Nom" htmlFor="r-name">
                <Input id="r-name" name="name" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bâtiment" htmlFor="r-building">
                  <Input id="r-building" name="building" />
                </Field>
                <Field label="Capacité" htmlFor="r-cap">
                  <Input id="r-cap" name="capacity" type="number" min={1} />
                </Field>
              </div>
            </FormDialog>
          </div>
          <Card>
            <CardContent className="pt-5">
              {data.rooms.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Salle</TH>
                      <TH>Bâtiment</TH>
                      <TH className="text-right">Capacité</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.rooms.map((r) => (
                      <TR key={r.id}>
                        <TD className="font-medium">{r.name}</TD>
                        <TD>{r.building ?? "—"}</TD>
                        <TD className="text-right">{r.capacity ?? "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState icon={DoorOpenIcon} title="Aucune salle" className="py-8" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {can(ctx, "timetable.manage") && (
          <TabsContent value="bells">
            <BellScheduleEditor initial={data.periods.map((p) => ({ label: p.label, starts_at: p.starts_at.slice(0, 5), ends_at: p.ends_at.slice(0, 5), is_break: p.is_break }))} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
