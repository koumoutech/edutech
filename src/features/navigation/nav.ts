import { can, isFamilyOnly, type AuthzSubject, type Permission, type RoleKey } from "@/lib/authz";

export type NavIcon =
  | "dashboard"
  | "students"
  | "children"
  | "classes"
  | "staff"
  | "leaves"
  | "timetable"
  | "assessments"
  | "grades"
  | "reportCards"
  | "attendance"
  | "finance"
  | "invoices"
  | "payments"
  | "expenses"
  | "announcements"
  | "messages"
  | "documents"
  | "requests"
  | "reports"
  | "assistant"
  | "settings"
  | "users"
  | "audit";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  group: "main" | "pedagogy" | "admin" | "finance" | "communication" | "settings";
  /** Shown in the mobile bottom bar (max 4 visible). */
  primary?: boolean;
}

interface NavRule extends NavItem {
  any?: Permission[];
  familyOnly?: boolean;
  staffOnly?: boolean;
}

const RULES: NavRule[] = [
  { href: "/app", label: "Tableau de bord", icon: "dashboard", group: "main", primary: true },
  { href: "/app/children", label: "Mes enfants", icon: "children", group: "main", primary: true, familyOnly: true, any: ["students.read"] },
  { href: "/app/students", label: "Élèves", icon: "students", group: "admin", primary: true, staffOnly: true, any: ["students.read"] },
  { href: "/app/classes", label: "Classes", icon: "classes", group: "pedagogy", staffOnly: true, any: ["students.read", "academics.manage"] },
  { href: "/app/timetable", label: "Emploi du temps", icon: "timetable", group: "pedagogy", any: ["timetable.read"] },
  { href: "/app/attendance", label: "Présences", icon: "attendance", group: "pedagogy", primary: true, any: ["attendance.read", "attendance.create"] },
  { href: "/app/assessments", label: "Évaluations & notes", icon: "assessments", group: "pedagogy", any: ["assessments.read", "grades.read"] },
  { href: "/app/report-cards", label: "Bulletins", icon: "reportCards", group: "pedagogy", any: ["report_cards.read"] },
  { href: "/app/staff", label: "Personnel", icon: "staff", group: "admin", staffOnly: true, any: ["staff.read"] },
  { href: "/app/staff/leaves", label: "Congés & absences", icon: "leaves", group: "admin", staffOnly: true, any: ["leaves.read", "leaves.create"] },
  { href: "/app/finance", label: "Finances", icon: "finance", group: "finance", any: ["finance.read"] },
  { href: "/app/finance/expenses", label: "Dépenses & budgets", icon: "expenses", group: "finance", staffOnly: true, any: ["expenses.read", "budgets.manage"] },
  { href: "/app/announcements", label: "Annonces", icon: "announcements", group: "communication", any: ["announcements.read", "announcements.create"] },
  { href: "/app/messages", label: "Messages", icon: "messages", group: "communication", any: ["messages.create"] },
  { href: "/app/documents", label: "Documents", icon: "documents", group: "communication", any: ["documents.read", "documents.create"] },
  { href: "/app/requests", label: "Demandes", icon: "requests", group: "communication", any: ["requests.create", "requests.manage"] },
  { href: "/app/reports", label: "Rapports", icon: "reports", group: "admin", staffOnly: true, any: ["reports.read"] },
  { href: "/app/assistant", label: "Assistant IA", icon: "assistant", group: "main", any: ["ai.use"] },
  { href: "/app/settings/users", label: "Utilisateurs & rôles", icon: "users", group: "settings", any: ["users.read", "roles.manage"] },
  { href: "/app/settings", label: "Paramètres", icon: "settings", group: "settings", any: ["school.manage", "academics.manage", "finance.manage", "templates.manage"] },
  { href: "/app/settings/audit", label: "Journal d'audit", icon: "audit", group: "settings", any: ["audit.read"] },
];

export const NAV_GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "Général",
  pedagogy: "Pédagogie",
  admin: "Administration",
  finance: "Finances",
  communication: "Communication",
  settings: "Paramètres",
};

/** Navigation entries visible for a user. Display only — every page re-checks permissions. */
export function buildNavigation(subject: AuthzSubject & { roles: { key: RoleKey }[] }): NavItem[] {
  const family = isFamilyOnly(subject.roles);
  return RULES.filter((r) => {
    if (r.familyOnly && !family) return false;
    if (r.staffOnly && family) return false;
    if (r.href === "/app/children" && !subject.roles.some((x) => x.key === "parent")) return false;
    return !r.any || r.any.some((p) => can(subject, p));
  }).map(({ href, label, icon, group, primary }) => ({ href, label, icon, group, primary }));
}
