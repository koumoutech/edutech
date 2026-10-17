import "server-only";
import { cache } from "react";
import { isoDate } from "@/lib/utils";
import { unwrapList } from "@/server/errors";
import type { Db } from "@/server/supabase/server";

export interface AcademicYear {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

export interface Term {
  id: string;
  name: string;
  position: number;
  starts_on: string;
  ends_on: string;
  is_closed: boolean;
}

export const getCurrentYear = cache(async (db: Db, schoolId: string): Promise<AcademicYear | null> => {
  const rows = unwrapList(
    await db
      .from("academic_years")
      .select("id, name, starts_on, ends_on, is_current")
      .eq("school_id", schoolId)
      .order("is_current", { ascending: false })
      .order("starts_on", { ascending: false })
      .limit(1),
  );
  return rows[0] ?? null;
});

export const listYears = cache(async (db: Db, schoolId: string): Promise<AcademicYear[]> =>
  unwrapList(
    await db
      .from("academic_years")
      .select("id, name, starts_on, ends_on, is_current")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
  ),
);

export const listTerms = cache(async (db: Db, schoolId: string, yearId: string): Promise<Term[]> =>
  unwrapList(
    await db
      .from("terms")
      .select("id, name, position, starts_on, ends_on, is_closed")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("position"),
  ),
);

/** The term containing `today`, else the last started term, else the first one. */
export function pickCurrentTerm(terms: Term[], today = isoDate()): Term | null {
  if (!terms.length) return null;
  return (
    terms.find((t) => t.starts_on <= today && today <= t.ends_on) ??
    [...terms].reverse().find((t) => t.starts_on <= today) ??
    terms[0]
  );
}

export interface ClassSummary {
  id: string;
  name: string;
  capacity: number;
  level: { id: string; name: string; position: number } | null;
}

export const listClasses = cache(async (db: Db, schoolId: string, yearId: string): Promise<ClassSummary[]> => {
  const rows = unwrapList(
    await db
      .from("classes")
      .select("id, name, capacity, level:levels!classes_school_id_level_id_fkey(id, name, position)")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("name"),
  );
  return rows.sort((a, b) => (a.level?.position ?? 0) - (b.level?.position ?? 0) || a.name.localeCompare(b.name));
});

/** Class-subject assignments of a teacher for a year. */
export async function listTeacherAssignments(db: Db, staffId: string, yearId: string) {
  return unwrapList(
    await db
      .from("class_subjects")
      .select(
        "id, coefficient, class:classes!class_subjects_school_id_class_id_fkey!inner(id, name, academic_year_id), subject:subjects!class_subjects_school_id_subject_id_fkey(id, name, code, color)",
      )
      .eq("teacher_id", staffId)
      .eq("class.academic_year_id", yearId),
  );
}

export function pageRange(page: number, pageSize: number): [number, number] {
  const p = Math.max(1, Math.floor(page) || 1);
  return [(p - 1) * pageSize, p * pageSize - 1];
}
