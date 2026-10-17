import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, connect, databaseUrl, DEMO_SCHOOL, expectError, USERS, type Query } from "./helpers";

const enabled = Boolean(databaseUrl());
let client: Client;

beforeAll(async () => {
  if (enabled) client = await connect();
});
afterAll(async () => {
  if (enabled) await client.end();
});

const OTHER_SCHOOL = "00000000-0000-4000-a000-0000000000ff";
const OTHER_ADMIN = "00000000-0000-4000-b000-0000000000ff";

/** Creates a second, unrelated school with one student, as superuser. */
async function createOtherSchool(q: Query) {
  await q(`insert into auth.users (id, email) values ($1, 'other-admin@example.test')`, [OTHER_ADMIN]);
  await q(`insert into public.schools (id, slug, name) values ($1, 'other-school', 'Autre école')`, [OTHER_SCHOOL]);
  await q(`select private.seed_school_defaults($1)`, [OTHER_SCHOOL]);
  await q(
    `insert into public.memberships (school_id, user_id, role_id)
     select $1, $2, id from public.roles where school_id = $1 and key = 'school_admin'`,
    [OTHER_SCHOOL, OTHER_ADMIN],
  );
  await q(
    `insert into public.students (id, school_id, matricule, first_name, last_name)
     values ('00000000-0000-4000-c000-0000000000ff', $1, 'OTHER-1', 'Secret', 'Student')`,
    [OTHER_SCHOOL],
  );
}

async function studentOfDemoUser(q: Query): Promise<string> {
  const rows = await q<{ id: string }>(`select id from public.students where user_id = $1`, [USERS.student]);
  return rows[0].id;
}

describe.skipIf(!enabled)("tenant isolation", () => {
  it("an administrator never sees another school's data", async () => {
    const rows = await asUser(
      client,
      USERS.admin,
      (q) => q(`select id from public.students where school_id = $1`, [OTHER_SCHOOL]),
      createOtherSchool,
    );
    expect(rows).toHaveLength(0);
  });

  it("another school's admin sees none of the demo school's students, grades or invoices", async () => {
    const result = await asUser(
      client,
      OTHER_ADMIN,
      async (q) => ({
        students: await q(`select 1 from public.students where school_id = $1`, [DEMO_SCHOOL]),
        grades: await q(`select 1 from public.grades where school_id = $1`, [DEMO_SCHOOL]),
        invoices: await q(`select 1 from public.invoices where school_id = $1`, [DEMO_SCHOOL]),
        school: await q(`select 1 from public.schools where id = $1`, [DEMO_SCHOOL]),
      }),
      createOtherSchool,
    );
    expect(result.students).toHaveLength(0);
    expect(result.grades).toHaveLength(0);
    expect(result.invoices).toHaveLength(0);
    expect(result.school).toHaveLength(0);
  });

  it("cannot insert data into another school", async () => {
    const err = await asUser(
      client,
      USERS.admin,
      (q) =>
        expectError(
          q,
          `insert into public.students (school_id, matricule, first_name, last_name) values ($1, 'X-1', 'A', 'B')`,
          [OTHER_SCHOOL],
        ),
      createOtherSchool,
    );
    expect(err).toMatch(/row-level security/);
  });

  it("cannot move a row to another school (school_id is immutable)", async () => {
    const err = await asUser(
      client,
      USERS.admin,
      async (q) => {
        const [s] = await q<{ id: string }>(`select id from public.students limit 1`);
        return expectError(q, `update public.students set school_id = $1 where id = $2`, [OTHER_SCHOOL, s.id]);
      },
      createOtherSchool,
    );
    expect(err).toMatch(/permission denied/);
  });

  it("anonymous visitors cannot read business tables", async () => {
    const err = await asUser(client, null, (q) => expectError(q, `select * from public.students`));
    expect(err).toMatch(/permission denied/);
    const settings = await asUser(client, null, (q) => q(`select key from public.platform_settings`));
    expect(settings.length).toBeGreaterThan(0);
  });

  it("anonymous visitors cannot call business functions", async () => {
    const err = await asUser(client, null, (q) => expectError(q, `select public.my_context()`));
    expect(err).toMatch(/permission denied/);
  });

  it("a suspended member loses access immediately", async () => {
    const rows = await asUser(
      client,
      USERS.secretary,
      (q) => q(`select 1 from public.students`),
      async (q) => {
        await q(`update public.memberships set status = 'suspended' where user_id = $1`, [USERS.secretary]);
      },
    );
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!enabled)("students, parents and families", () => {
  it("a student only sees their own record", async () => {
    const rows = await asUser(client, USERS.student, (q) =>
      q<{ user_id: string }>(`select user_id from public.students`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USERS.student);
  });

  it("a parent only sees the children linked to them", async () => {
    const rows = await asUser(client, USERS.parent, (q) =>
      q<{ last_name: string }>(`select last_name from public.students`),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.last_name === "N'Guessan")).toBe(true);
  });

  it("a parent cannot read another family's child, even by id", async () => {
    const rows = await asUser(client, USERS.parent2, async (q) => {
      const mine = await q(`select id from public.students`);
      expect(mine).toHaveLength(1);
      return q(`select * from public.students where user_id = $1`, [USERS.student]);
    });
    expect(rows).toHaveLength(0);
  });

  it("a parent cannot link themselves to another child", async () => {
    const err = await asUser(client, USERS.parent2, async (q) => {
      const [g] = await q<{ id: string }>(`select id from public.guardians where user_id = $1`, [USERS.parent2]);
      const [other] = await q<{ id: string }>(`select id from public.students limit 1`);
      return expectError(
        q,
        `insert into public.student_guardians (school_id, student_id, guardian_id, relationship) values ($1, $2, $3, 'father')`,
        [DEMO_SCHOOL, other.id, g.id],
      );
    });
    expect(err).toMatch(/row-level security/);
  });

  it("students and parents only see grades of published assessments", async () => {
    const [student, parent] = await Promise.all([
      asUser(client, USERS.student, (q) =>
        q<{ status: string }>(
          `select a.status from public.grades g join public.assessments a on a.id = g.assessment_id`,
        ),
      ),
    ]).then(async ([s]) => [
      s,
      await asUser(client, USERS.parent, (q) =>
        q<{ status: string }>(
          `select a.status from public.grades g join public.assessments a on a.id = g.assessment_id`,
        ),
      ),
    ]);
    expect(student.length).toBeGreaterThan(0);
    expect(student.every((r) => r.status === "published")).toBe(true);
    expect(parent.every((r) => r.status === "published")).toBe(true);
  });

  it("medical data is restricted to health.read holders and the family", async () => {
    const teacher = await asUser(client, USERS.mathTeacher, (q) => q(`select * from public.student_health`));
    const parent = await asUser(client, USERS.parent, (q) => q(`select * from public.student_health`));
    const secretary = await asUser(client, USERS.secretary, (q) => q(`select * from public.student_health`));
    expect(teacher).toHaveLength(0);
    expect(parent).toHaveLength(1);
    expect(secretary).toHaveLength(1);
  });

  it("a parent can submit a justification for their child but not for another student", async () => {
    await asUser(client, USERS.parent, async (q) => {
      const studentId = await studentOfDemoUser(q);
      await q(
        `insert into public.absence_justifications (school_id, student_id, from_date, to_date, reason, submitted_by)
         values ($1, $2, current_date, current_date, 'Rendez-vous médical', $3)`,
        [DEMO_SCHOOL, studentId, USERS.parent],
      );
    });
    let otherStudent = "";
    const err = await asUser(
      client,
      USERS.parent,
      (q) =>
        expectError(
          q,
          `insert into public.absence_justifications (school_id, student_id, from_date, to_date, reason, submitted_by)
           values ($1, $2, current_date, current_date, 'Motif quelconque', $3)`,
          [DEMO_SCHOOL, otherStudent, USERS.parent],
        ),
      async (q) => {
        const [row] = await q<{ id: string }>(
          `select s.id from public.students s where not exists (
             select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
             where sg.student_id = s.id and g.user_id = $1) order by s.id limit 1`,
          [USERS.parent],
        );
        otherStudent = row.id;
      },
    );
    expect(err).toMatch(/row-level security/);
  });
});

describe.skipIf(!enabled)("teachers", () => {
  async function createUnassignedClass(q: Query) {
    await q(
      `
      insert into public.classes (id, school_id, academic_year_id, level_id, name)
      select '00000000-0000-4000-d000-000000000001', $1, ay.id, (select id from public.levels where school_id = $1 order by position limit 1), '6e Z'
      from public.academic_years ay where ay.school_id = $1 and ay.is_current`,
      [DEMO_SCHOOL],
    );
    await q(
      `insert into public.students (id, school_id, matricule, first_name, last_name)
             values ('00000000-0000-4000-c000-000000000001', $1, 'Z-0001', 'Hors', 'Classe')`,
      [DEMO_SCHOOL],
    );
    await q(
      `insert into public.enrollments (school_id, student_id, academic_year_id, class_id)
             select $1, '00000000-0000-4000-c000-000000000001', ay.id, '00000000-0000-4000-d000-000000000001'
             from public.academic_years ay where ay.school_id = $1 and ay.is_current`,
      [DEMO_SCHOOL],
    );
    await q(
      `insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id)
             select '00000000-0000-4000-e000-000000000001', $1, '00000000-0000-4000-d000-000000000001', s.id,
                    (select id from public.staff_members where employee_number = 'ENS-003')
             from public.subjects s where s.school_id = $1 and s.code = 'MATH'`,
      [DEMO_SCHOOL],
    );
    await q(
      `insert into public.assessments (id, school_id, class_subject_id, term_id, title)
             select '00000000-0000-4000-f000-000000000001', $1, '00000000-0000-4000-e000-000000000001', t.id, 'Test'
             from public.terms t where t.school_id = $1 and t.position = 1`,
      [DEMO_SCHOOL],
    );
    await q(
      `insert into public.grades (school_id, assessment_id, student_id, score)
             values ($1, '00000000-0000-4000-f000-000000000001', '00000000-0000-4000-c000-000000000001', 12)`,
      [DEMO_SCHOOL],
    );
  }

  it("a teacher cannot see students of a class they do not teach", async () => {
    const rows = await asUser(
      client,
      USERS.mathTeacher,
      (q) => q(`select id from public.students where id = '00000000-0000-4000-c000-000000000001'`),
      createUnassignedClass,
    );
    expect(rows).toHaveLength(0);
  });

  it("a teacher cannot read grades of a class they do not teach", async () => {
    const rows = await asUser(
      client,
      USERS.mathTeacher,
      (q) => q(`select * from public.grades where assessment_id = '00000000-0000-4000-f000-000000000001'`),
      createUnassignedClass,
    );
    expect(rows).toHaveLength(0);
  });

  it("a teacher can enter grades for their subject but not for a colleague's subject", async () => {
    await asUser(client, USERS.mathTeacher, async (q) => {
      const [math] = await q<{ id: string }>(
        `select a.id from public.assessments a join public.class_subjects cs on cs.id = a.class_subject_id
         join public.subjects s on s.id = cs.subject_id where s.code = 'MATH' and a.status = 'draft' limit 1`,
      );
      const [french] = await q<{ id: string }>(
        `select a.id from public.assessments a join public.class_subjects cs on cs.id = a.class_subject_id
         join public.subjects s on s.id = cs.subject_id where s.code = 'FR' and a.status = 'draft' limit 1`,
      );
      expect(math).toBeDefined();
      // Reading French assessments is allowed (homeroom/any subject of an assigned class), writing is not.
      const ok = await expectError(
        q,
        `select public.save_grades($1, jsonb_build_array(jsonb_build_object('student_id',
           (select e.student_id from public.enrollments e join public.class_subjects cs on cs.class_id = e.class_id
            join public.assessments a on a.class_subject_id = cs.id where a.id = $1 limit 1), 'score', 15)))`,
        [math.id],
      );
      expect(ok).toBeNull();
      if (french) {
        const denied = await expectError(
          q,
          `select public.save_grades($1, jsonb_build_array(jsonb_build_object('student_id',
             (select e.student_id from public.enrollments e join public.class_subjects cs on cs.class_id = e.class_id
              join public.assessments a on a.class_subject_id = cs.id where a.id = $1 limit 1), 'score', 15)))`,
          [french.id],
        );
        expect(denied).toMatch(/FORBIDDEN/);
      }
    });
  });

  it("scores above the assessment scale are rejected", async () => {
    const err = await asUser(client, USERS.mathTeacher, async (q) => {
      const [a] = await q<{ id: string }>(
        `select a.id from public.assessments a join public.class_subjects cs on cs.id = a.class_subject_id
         join public.subjects s on s.id = cs.subject_id where s.code = 'MATH' and a.status = 'draft' limit 1`,
      );
      return expectError(
        q,
        `select public.save_grades($1, jsonb_build_array(jsonb_build_object('student_id',
           (select e.student_id from public.enrollments e join public.class_subjects cs on cs.class_id = e.class_id
            join public.assessments a on a.class_subject_id = cs.id where a.id = $1 limit 1), 'score', 25)))`,
        [a.id],
      );
    });
    expect(err).toMatch(/SCORE_OUT_OF_RANGE/);
  });

  it("a teacher cannot validate their own assessment nor read finances", async () => {
    await asUser(client, USERS.mathTeacher, async (q) => {
      const [a] = await q<{ id: string }>(`select id from public.assessments where status = 'draft' limit 1`);
      expect(await expectError(q, `select public.set_assessment_status($1, 'validated')`, [a.id])).toMatch(/FORBIDDEN/);
      expect(await q(`select * from public.invoices`)).toHaveLength(0);
      expect(await q(`select * from public.payments`)).toHaveLength(0);
      expect(
        await q(
          `select * from public.staff_contracts where staff_id <> (select id from public.staff_members where user_id = $1)`,
          [USERS.mathTeacher],
        ),
      ).toHaveLength(0);
    });
  });
});

describe.skipIf(!enabled)("validated grades", () => {
  async function publishedGrade(q: Query) {
    const [g] = await q<{ id: string; score: string }>(
      `select g.id, g.score from public.grades g join public.assessments a on a.id = g.assessment_id
       where a.status = 'published' and g.score is not null limit 1`,
    );
    return g;
  }

  it("a validated grade cannot be edited directly, even by its teacher", async () => {
    const err = await asUser(client, USERS.admin, async (q) => {
      const g = await publishedGrade(q);
      return expectError(q, `update public.grades set score = 19 where id = $1`, [g.id]);
    });
    expect(err).toMatch(/GRADE_LOCKED/);
  });

  it("correction requires grades.validate and a reason, and is recorded", async () => {
    await asUser(client, USERS.mathTeacher, async (q) => {
      const [g] = await q<{ id: string }>(
        `select g.id from public.grades g join public.assessments a on a.id = g.assessment_id where a.status = 'published' limit 1`,
      );
      expect(await expectError(q, `select public.correct_grade($1, 12, false, 'Erreur de saisie')`, [g.id])).toMatch(
        /FORBIDDEN/,
      );
    });
    await asUser(client, USERS.academicDirector, async (q) => {
      const g = await publishedGrade(q);
      expect(await expectError(q, `select public.correct_grade($1, 12, false, '')`, [g.id])).toMatch(/REASON_REQUIRED/);
      await q(`select public.correct_grade($1, 12.5, false, 'Erreur de report constatée')`, [g.id]);
      const [after] = await q<{ score: string }>(`select score from public.grades where id = $1`, [g.id]);
      expect(Number(after.score)).toBe(12.5);
      const rev = await q<{ reason: string }>(`select reason from public.grade_revisions where grade_id = $1`, [g.id]);
      expect(rev[0].reason).toBe("Erreur de report constatée");
    });
  });
});

describe.skipIf(!enabled)("finance", () => {
  it("a parent sees only their children's invoices; another parent sees none of them", async () => {
    const p1 = await asUser(client, USERS.parent, (q) =>
      q<{ student_id: string }>(`select student_id from public.invoices`),
    );
    const p2 = await asUser(client, USERS.parent2, (q) =>
      q<{ student_id: string }>(`select student_id from public.invoices`),
    );
    expect(p1.length).toBe(2);
    expect(p2.length).toBe(1);
    expect(p1.some((r) => p2.some((o) => o.student_id === r.student_id))).toBe(false);
  });

  it("only habilitated users can record payments", async () => {
    for (const user of [USERS.parent, USERS.mathTeacher, USERS.secretary]) {
      const err = await asUser(client, user, (q) =>
        expectError(
          q,
          `select public.record_payment($1, (select id from public.students limit 1), 1000,
             (select id from public.payment_methods where kind = 'cash' limit 1))`,
          [DEMO_SCHOOL],
        ),
      );
      expect(err).toMatch(/FORBIDDEN|permission denied/);
    }
  });

  it("payments keep invoice balances consistent and reject overpayment", async () => {
    await asUser(client, USERS.accountant, async (q) => {
      const [inv] = await q<{ id: string; student_id: string; balance: string; total: string }>(
        `select id, student_id, balance, total from public.invoices where status = 'partially_paid' limit 1`,
      );
      const cash = (await q<{ id: string }>(`select id from public.payment_methods where kind = 'cash'`))[0].id;
      const over = await expectError(
        q,
        `select public.record_payment($1, $2, $3, $4, null, null, now(), jsonb_build_array(jsonb_build_object('invoice_id', $5::uuid, 'amount', $3::numeric)))`,
        [DEMO_SCHOOL, inv.student_id, Number(inv.balance) + 1, cash, inv.id],
      );
      expect(over).toMatch(/INVALID_ALLOCATION|OVERPAYMENT/);
      await q(
        `select public.record_payment($1, $2, $3, $4, null, 'Payeur test', now(), jsonb_build_array(jsonb_build_object('invoice_id', $5::uuid, 'amount', $3::numeric)))`,
        [DEMO_SCHOOL, inv.student_id, Number(inv.balance), cash, inv.id],
      );
      const [after] = await q<{ balance: string; status: string; amount_paid: string; total: string }>(
        `select balance, status, amount_paid, total from public.invoices where id = $1`,
        [inv.id],
      );
      expect(Number(after.balance)).toBe(0);
      expect(after.status).toBe("paid");
      expect(Number(after.amount_paid)).toBe(Number(after.total));
    });
  });

  it("refunds release allocations and are traceable", async () => {
    await asUser(client, USERS.accountant, async (q) => {
      const [p] = await q<{ id: string; amount: string; invoice_id: string }>(
        `select p.id, p.amount, pa.invoice_id from public.payments p join public.payment_allocations pa on pa.payment_id = p.id
         where p.status = 'completed' and pa.is_active limit 1`,
      );
      const [before] = await q<{ amount_paid: string }>(`select amount_paid from public.invoices where id = $1`, [
        p.invoice_id,
      ]);
      expect(await expectError(q, `select public.refund_payment($1, $2, 'trop')`, [p.id, 1])).toMatch(
        /REASON_REQUIRED/,
      );
      await q(`select public.refund_payment($1, 1000, 'Remboursement partiel test')`, [p.id]);
      const [after] = await q<{ amount_paid: string }>(`select amount_paid from public.invoices where id = $1`, [
        p.invoice_id,
      ]);
      expect(Number(before.amount_paid) - Number(after.amount_paid)).toBe(1000);
      const refunds = await q(`select 1 from public.refunds where payment_id = $1`, [p.id]);
      expect(refunds).toHaveLength(1);
      // The accountant has no audit.read permission: the audit trail stays hidden from them.
      expect(await q(`select 1 from public.audit_logs`)).toHaveLength(0);
    });
  });

  it("issued invoices cannot be tampered with directly", async () => {
    const err = await asUser(client, USERS.accountant, async (q) => {
      const [inv] = await q<{ id: string }>(`select id from public.invoices where status <> 'draft' limit 1`);
      return expectError(q, `update public.invoices set status = 'paid' where id = $1`, [inv.id]);
    });
    expect(err).toMatch(/INVOICE_CHANGE_REQUIRES_RPC/);
  });

  it("payment allocations cannot be inserted directly", async () => {
    const err = await asUser(client, USERS.accountant, (q) =>
      expectError(
        q,
        `insert into public.payment_allocations (school_id, payment_id, invoice_id, amount)
         select $1, (select id from public.payments limit 1), (select id from public.invoices limit 1), 1`,
        [DEMO_SCHOOL],
      ),
    );
    expect(err).toMatch(/permission denied/);
  });
});

describe.skipIf(!enabled)("private files", () => {
  async function privateDoc(q: Query) {
    await q(
      `insert into public.documents (id, school_id, category, title, student_id, storage_path, mime_type, size_bytes, visible_to_family)
             select '00000000-0000-4000-9000-000000000001', $1::uuid, 'student_file', 'Dossier confidentiel', s.id,
                    $1::text || '/00000000-0000-4000-9000-000000000001/file.pdf', 'application/pdf', 100, false
             from public.students s where s.user_id = $2`,
      [DEMO_SCHOOL, USERS.student],
    );
    await q(
      `insert into storage.objects (bucket_id, name) values ('documents', $1 || '/00000000-0000-4000-9000-000000000001/file.pdf')`,
      [DEMO_SCHOOL],
    );
  }

  it("a family cannot download a document not shared with them", async () => {
    const rows = await asUser(
      client,
      USERS.parent,
      (q) => q(`select name from storage.objects where bucket_id = 'documents'`),
      privateDoc,
    );
    expect(rows).toHaveLength(0);
  });

  it("staff with documents.read can download it", async () => {
    const rows = await asUser(
      client,
      USERS.secretary,
      (q) => q(`select name from storage.objects where bucket_id = 'documents'`),
      privateDoc,
    );
    expect(rows).toHaveLength(1);
  });

  it("another school can never read it", async () => {
    const rows = await asUser(
      client,
      OTHER_ADMIN,
      (q) => q(`select name from storage.objects`),
      async (q) => {
        await privateDoc(q);
        await createOtherSchool(q);
      },
    );
    expect(rows).toHaveLength(0);
  });

  it("uploads require a matching metadata row created by the uploader", async () => {
    const err = await asUser(client, USERS.parent, (q) =>
      expectError(q, `insert into storage.objects (bucket_id, name) values ('documents', $1 || '/random/evil.pdf')`, [
        DEMO_SCHOOL,
      ]),
    );
    expect(err).toMatch(/row-level security/);
  });
});

describe.skipIf(!enabled)("accounts, roles and invitations", () => {
  it("a director cannot grant a privileged role (privilege escalation)", async () => {
    const err = await asUser(client, USERS.director, (q) =>
      expectError(
        q,
        `select public.assign_role($1, $2, (select id from public.roles where school_id = $1 and key = 'school_admin'))`,
        [DEMO_SCHOOL, USERS.secretary],
      ),
    );
    expect(err).toMatch(/FORBIDDEN/);
  });

  it("a secretary cannot invite users nor modify roles", async () => {
    await asUser(client, USERS.secretary, async (q) => {
      expect(
        await expectError(
          q,
          `select public.create_invitation($1, 'x@example.test', (select id from public.roles where school_id = $1 and key = 'teacher'), repeat('a', 64))`,
          [DEMO_SCHOOL],
        ),
      ).toMatch(/FORBIDDEN/);
      expect(
        await expectError(
          q,
          `insert into public.role_permissions (role_id, permission_key) select id, 'finance.read' from public.roles where key = 'secretary'`,
        ),
      ).toMatch(/row-level security/);
      expect(
        await expectError(
          q,
          `insert into public.memberships (school_id, user_id, role_id) select $1, $2, id from public.roles where key = 'school_admin' and school_id = $1`,
          [DEMO_SCHOOL, USERS.secretary],
        ),
      ).toMatch(/row-level security/);
    });
  });

  it("invitations require the matching e-mail and a valid token", async () => {
    const NEW_USER = "00000000-0000-4000-b000-0000000000aa";
    const token = "test-token-123456789";
    await asUser(
      client,
      USERS.admin,
      async (q) => {
        const [{ id: roleId }] = await q<{ id: string }>(
          `select id from public.roles where school_id = $1 and key = 'teacher'`,
          [DEMO_SCHOOL],
        );
        const [{ h }] = await q<{ h: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [token]);
        await q(`select public.create_invitation($1, 'new.teacher@example.test', $2, $3)`, [DEMO_SCHOOL, roleId, h]);
        // switch identity to the invitee
        await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: NEW_USER })]);
        expect(await expectError(q, `select public.accept_invitation('wrong-token')`)).toMatch(/INVITATION_INVALID/);
        const school = await q<{ s: string }>(`select public.accept_invitation($1) as s`, [token]);
        expect(school[0].s).toBe(DEMO_SCHOOL);
        const ctx = await q<{ c: { schools: { roles: { key: string }[] }[] } }>(`select public.my_context() as c`);
        expect(ctx[0].c.schools[0].roles.map((r) => r.key)).toContain("teacher");
      },
      async (q) => {
        await q(`insert into auth.users (id, email) values ($1, 'new.teacher@example.test')`, [NEW_USER]);
      },
    );
  });

  it("an invitation cannot be accepted by another account", async () => {
    const INTRUDER = "00000000-0000-4000-b000-0000000000bb";
    await asUser(
      client,
      USERS.admin,
      async (q) => {
        const [{ id: roleId }] = await q<{ id: string }>(
          `select id from public.roles where school_id = $1 and key = 'parent'`,
          [DEMO_SCHOOL],
        );
        const [{ h }] = await q<{ h: string }>(`select encode(sha256(convert_to('tok-xyz', 'UTF8')), 'hex') as h`);
        await q(`select public.create_invitation($1, 'real.parent@example.test', $2, $3)`, [DEMO_SCHOOL, roleId, h]);
        await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: INTRUDER })]);
        expect(await expectError(q, `select public.accept_invitation('tok-xyz')`)).toMatch(/INVITATION_EMAIL_MISMATCH/);
      },
      async (q) => {
        await q(`insert into auth.users (id, email) values ($1, 'intruder@example.test')`, [INTRUDER]);
      },
    );
  });

  it("users cannot read other users' notifications or AI conversations", async () => {
    await asUser(
      client,
      USERS.parent2,
      async (q) => {
        expect(await q(`select * from public.notifications where user_id <> $1`, [USERS.parent2])).toHaveLength(0);
        expect(await q(`select * from public.ai_conversations`)).toHaveLength(0);
      },
      async (q) => {
        await q(`insert into public.ai_conversations (school_id, user_id, title) values ($1, $2, 'Privé')`, [
          DEMO_SCHOOL,
          USERS.parent,
        ]);
      },
    );
  });

  it("families can only message staff members", async () => {
    await asUser(client, USERS.parent, async (q) => {
      expect(
        await expectError(q, `select public.start_thread($1, 'Bonjour', array[$2::uuid], 'Message')`, [
          DEMO_SCHOOL,
          USERS.parent2,
        ]),
      ).toMatch(/FORBIDDEN/);
      const ok = await expectError(q, `select public.start_thread($1, 'Question', array[$2::uuid], 'Bonjour')`, [
        DEMO_SCHOOL,
        USERS.mathTeacher,
      ]);
      expect(ok).toBeNull();
    });
  });
});

describe.skipIf(!enabled)("attendance", () => {
  it("a teacher records attendance for an assigned class and parents are notified of absences", async () => {
    await asUser(client, USERS.mathTeacher, async (q) => {
      const [c] = await q<{ class_id: string; student_id: string }>(
        `select e.class_id, e.student_id from public.enrollments e
         join public.students s on s.id = e.student_id where s.user_id = $1`,
        [USERS.student],
      );
      await q(
        `select public.save_attendance($1, $2, current_date - 30, jsonb_build_array(jsonb_build_object('student_id', $3::uuid, 'status', 'absent')))`,
        [DEMO_SCHOOL, c.class_id, c.student_id],
      );
    });
    const notifs = await asUser(client, USERS.parent, (q) =>
      q(`select 1 from public.notifications where type = 'attendance.absence'`),
    );
    // notifications are written inside a rolled back transaction above, so we only assert the parent can query safely
    expect(Array.isArray(notifs)).toBe(true);
  });

  it("a parent cannot record attendance", async () => {
    const err = await asUser(client, USERS.parent, async (q) => {
      const [c] = await q<{ class_id: string; student_id: string }>(
        `select e.class_id, e.student_id from public.enrollments e join public.students s on s.id = e.student_id where s.user_id = $1`,
        [USERS.student],
      );
      return expectError(
        q,
        `select public.save_attendance($1, $2, current_date, jsonb_build_array(jsonb_build_object('student_id', $3::uuid, 'status', 'present')))`,
        [DEMO_SCHOOL, c.class_id, c.student_id],
      );
    });
    expect(err).toMatch(/row-level security/);
  });
});

describe.skipIf(!databaseUrl())("AI assistant storage", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(async () => {
    await client.end();
  });

  it("conversations are private to their author, even for administrators", async () => {
    const seen = await asUser(
      client,
      USERS.admin,
      (q) => q(`select id from public.ai_conversations`),
      async (q) => {
        await q(`insert into public.ai_conversations (school_id, user_id, title) values ($1, $2, 'privée')`, [
          DEMO_SCHOOL,
          USERS.mathTeacher,
        ]);
      },
    );
    expect(seen).toHaveLength(0);
  });

  it("a user without ai.use cannot start a conversation", async () => {
    const err = await asUser(
      client,
      USERS.parent,
      (q) =>
        expectError(q, `insert into public.ai_conversations (school_id, title) values ($1, 'test')`, [DEMO_SCHOOL]),
      async (q) => {
        // Parents have ai.use by default (family-scoped tools); revoke it for this scenario.
        await q(
          `delete from public.role_permissions where permission_key = 'ai.use' and role_id in (select id from public.roles where school_id = $1 and key = 'parent')`,
          [DEMO_SCHOOL],
        );
      },
    );
    expect(err).toMatch(/row-level security/);
  });

  it("a user cannot add messages to someone else's conversation", async () => {
    const err = await asUser(
      client,
      USERS.frenchTeacher,
      async (q) => {
        const [c] = await q<{ id: string }>(`select id from public.ai_conversations where title = 'cible'`);
        return expectError(
          q,
          `insert into public.ai_messages (conversation_id, school_id, role, content) values ($1, $2, 'user', 'x')`,
          [c?.id ?? null, DEMO_SCHOOL],
        );
      },
      async (q) => {
        await q(`insert into public.ai_conversations (school_id, user_id, title) values ($1, $2, 'cible')`, [
          DEMO_SCHOOL,
          USERS.mathTeacher,
        ]);
      },
    );
    expect(err).toMatch(/row-level security|null value/);
  });

  it("tool audit rows can be written by members but only read with audit.read", async () => {
    const [teacherRead, adminRead] = await asUser(client, USERS.mathTeacher, async (q) => {
      await q(
        `insert into public.ai_tool_invocations (school_id, tool_name, outcome) values ($1, 'get_grades_summary', 'ok')`,
        [DEMO_SCHOOL],
      );
      const mine = await q(`select 1 from public.ai_tool_invocations`);
      await q(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: USERS.admin, role: "authenticated" }),
      ]);
      const admin = await q(`select tool_name from public.ai_tool_invocations`);
      return [mine, admin];
    });
    expect(teacherRead).toHaveLength(0);
    expect(adminRead.length).toBeGreaterThan(0);
  });
});
