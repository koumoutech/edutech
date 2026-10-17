import { Field, Input, Select } from "@/components/ui/form-controls";

export interface StaffDefaults {
  id?: string;
  employee_number?: string;
  first_name?: string;
  last_name?: string;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string;
  department?: string | null;
  is_teacher?: boolean;
  hire_date?: string | null;
}

export function StaffFormFields({ d = {} }: { d?: StaffDefaults }) {
  return (
    <>
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" htmlFor="st-first">
          <Input id="st-first" name="first_name" defaultValue={d.first_name} required />
        </Field>
        <Field label="Nom" htmlFor="st-last">
          <Input id="st-last" name="last_name" defaultValue={d.last_name} required />
        </Field>
        <Field label="Matricule employé" htmlFor="st-num">
          <Input id="st-num" name="employee_number" defaultValue={d.employee_number} required />
        </Field>
        <Field label="Sexe" htmlFor="st-gender">
          <Select id="st-gender" name="gender" defaultValue={d.gender ?? ""}>
            <option value="">—</option>
            <option value="F">Féminin</option>
            <option value="M">Masculin</option>
          </Select>
        </Field>
        <Field label="Fonction" htmlFor="st-job">
          <Input id="st-job" name="job_title" defaultValue={d.job_title ?? "Enseignant"} required />
        </Field>
        <Field label="Service" htmlFor="st-dep">
          <Input id="st-dep" name="department" defaultValue={d.department ?? ""} />
        </Field>
        <Field label="E-mail professionnel" htmlFor="st-email">
          <Input id="st-email" name="email" type="email" defaultValue={d.email ?? ""} />
        </Field>
        <Field label="Téléphone" htmlFor="st-phone">
          <Input id="st-phone" name="phone" type="tel" defaultValue={d.phone ?? ""} />
        </Field>
        <Field label="Date d'embauche" htmlFor="st-hire">
          <Input id="st-hire" name="hire_date" type="date" defaultValue={d.hire_date ?? ""} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_teacher" defaultChecked={d.is_teacher} className="size-4 accent-[var(--primary)]" /> Enseignant
        </label>
      </div>
    </>
  );
}
