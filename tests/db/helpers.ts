import { Client } from "pg";

export const DEMO_SCHOOL = "00000000-0000-4000-a000-000000000001";
export const USERS = {
  admin: "00000000-0000-4000-b000-000000000001",
  director: "00000000-0000-4000-b000-000000000002",
  academicDirector: "00000000-0000-4000-b000-000000000003",
  secretary: "00000000-0000-4000-b000-000000000004",
  accountant: "00000000-0000-4000-b000-000000000005",
  mathTeacher: "00000000-0000-4000-b000-000000000006",
  frenchTeacher: "00000000-0000-4000-b000-000000000007",
  supervisor: "00000000-0000-4000-b000-000000000008",
  hr: "00000000-0000-4000-b000-000000000009",
  parent: "00000000-0000-4000-b000-000000000010",
  student: "00000000-0000-4000-b000-000000000011",
  parent2: "00000000-0000-4000-b000-000000000012",
} as const;

export function databaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL;
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  return client;
}

/**
 * Runs `fn` inside a transaction that is always rolled back.
 * `setup` runs first as the superuser (fixtures), then the session switches to the
 * `authenticated` role with the given user id as JWT subject — exactly like PostgREST.
 */
export async function asUser<T>(
  client: Client,
  userId: string | null,
  fn: (q: Query) => Promise<T>,
  setup?: (q: Query) => Promise<void>,
): Promise<T> {
  await client.query("begin");
  try {
    const q: Query = async (sql, params) => (await client.query(sql, params as unknown[])).rows;
    if (setup) await setup(q);
    if (userId) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    } else {
      await client.query("set local role anon");
      await client.query("select set_config('request.jwt.claims', '', true)");
    }
    return await fn(q);
  } finally {
    await client.query("rollback");
  }
}

export type Query = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;

/** Executes a statement inside a savepoint and returns the error message (or null). */
export async function expectError(q: Query, sql: string, params?: unknown[]): Promise<string | null> {
  await q("savepoint s");
  try {
    await q(sql, params);
    await q("release savepoint s");
    return null;
  } catch (e) {
    await q("rollback to savepoint s");
    return (e as Error).message;
  }
}
