/**
 * Pure authorization helpers shared by server code (enforcement) and UI (display only).
 * The UI must never rely on these for security: the server re-checks and RLS enforces.
 */

export type Scope = "school" | "assigned" | "linked" | "self";

export const PERMISSIONS = [
  "school.manage",
  "users.read",
  "users.create",
  "users.manage",
  "roles.manage",
  "audit.read",
  "academics.manage",
  "students.read",
  "students.create",
  "students.update",
  "students.delete",
  "students.export",
  "health.read",
  "guardians.read",
  "guardians.manage",
  "enrollments.manage",
  "staff.read",
  "staff.manage",
  "hr.read",
  "hr.manage",
  "leaves.read",
  "leaves.create",
  "leaves.validate",
  "timetable.read",
  "timetable.manage",
  "assessments.read",
  "assessments.create",
  "assessments.update",
  "assessments.delete",
  "assessments.validate",
  "assessments.publish",
  "grades.read",
  "grades.create",
  "grades.validate",
  "grades.export",
  "report_cards.read",
  "report_cards.create",
  "report_cards.validate",
  "report_cards.publish",
  "attendance.read",
  "attendance.create",
  "attendance.update",
  "attendance.export",
  "justifications.create",
  "justifications.validate",
  "finance.read",
  "finance.manage",
  "invoices.create",
  "payments.create",
  "payments.validate",
  "finance.export",
  "expenses.read",
  "expenses.create",
  "expenses.validate",
  "budgets.manage",
  "announcements.read",
  "announcements.create",
  "announcements.publish",
  "messages.create",
  "documents.read",
  "documents.create",
  "documents.delete",
  "templates.manage",
  "requests.create",
  "requests.manage",
  "reports.read",
  "reports.export",
  "ai.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleKey =
  | "school_admin"
  | "director"
  | "academic_director"
  | "secretary"
  | "accountant"
  | "teacher"
  | "supervisor"
  | "hr_manager"
  | "librarian"
  | "admin_staff"
  | "it_manager"
  | "student"
  | "parent"
  | (string & {});

export interface SchoolMembership {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  logo_path: string | null;
  brand_color: string | null;
  is_demo: boolean;
  roles: { key: RoleKey; name: string }[];
  permissions: Partial<Record<string, Scope[]>>;
  staff_id: string | null;
  guardian_id: string | null;
  student_id: string | null;
}

export interface AuthzSubject {
  permissions: Partial<Record<string, Scope[]>>;
}

export function scopesFor(subject: AuthzSubject, permission: Permission): Scope[] {
  return subject.permissions[permission] ?? [];
}

/** Has the permission under any scope (or under one of the given scopes). */
export function can(subject: AuthzSubject, permission: Permission, scopes?: Scope[]): boolean {
  const held = scopesFor(subject, permission);
  if (!scopes) return held.length > 0;
  return held.some((s) => scopes.includes(s));
}

/** Has the permission for the whole school. */
export function canSchoolWide(subject: AuthzSubject, permission: Permission): boolean {
  return scopesFor(subject, permission).includes("school");
}

export type DashboardKind =
  "direction" | "academic" | "teacher" | "secretary" | "accountant" | "hr" | "staff" | "parent" | "student";

const DASHBOARD_PRIORITY: [RoleKey, DashboardKind][] = [
  ["school_admin", "direction"],
  ["director", "direction"],
  ["academic_director", "academic"],
  ["accountant", "accountant"],
  ["secretary", "secretary"],
  ["hr_manager", "hr"],
  ["teacher", "teacher"],
  ["supervisor", "staff"],
  ["it_manager", "staff"],
  ["librarian", "staff"],
  ["admin_staff", "staff"],
  ["parent", "parent"],
  ["student", "student"],
];

/** Picks the dashboard matching the most important role the user holds. */
export function dashboardKind(roles: { key: RoleKey }[]): DashboardKind {
  const keys = new Set(roles.map((r) => r.key));
  for (const [role, kind] of DASHBOARD_PRIORITY) if (keys.has(role)) return kind;
  return "staff";
}

export function isFamilyOnly(roles: { key: RoleKey }[]): boolean {
  return roles.length > 0 && roles.every((r) => r.key === "parent" || r.key === "student");
}
