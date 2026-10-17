/**
 * Grade computation engine (pure, unit-tested). Rules are configurable per
 * school / level / education system through a grading policy.
 *
 *   subject average = Σ(score/max × scale × coef_assessment) / Σ coef_assessment
 *   general average = Σ(subject average × coef_subject) / Σ coef_subject   (subjects without grades skipped)
 *   ranking         = standard competition ranking ("1, 2, 2, 4")
 */

export interface GradingPolicy {
  scale_max: number;
  passing_mark: number;
  decimals: number;
  rounding: "half_up" | "down" | "up";
  /** How an absence without excuse is handled. */
  missing_policy: "exclude" | "zero";
  /** How an excused absence is handled. */
  excused_policy: "exclude" | "zero";
  ranking_enabled: boolean;
  mentions: { min: number; label: string }[];
}

export const DEFAULT_POLICY: GradingPolicy = {
  scale_max: 20,
  passing_mark: 10,
  decimals: 2,
  rounding: "half_up",
  missing_policy: "exclude",
  excused_policy: "exclude",
  ranking_enabled: true,
  mentions: [
    { min: 16, label: "Très bien" },
    { min: 14, label: "Bien" },
    { min: 12, label: "Assez bien" },
    { min: 10, label: "Passable" },
    { min: 0, label: "Insuffisant" },
  ],
};

export interface SubjectInput {
  subject_id: string;
  subject_name: string;
  coefficient: number;
  teacher_name?: string | null;
  position?: number;
}

export interface AssessmentInput {
  id: string;
  subject_id: string;
  max_score: number;
  coefficient: number;
}

export interface GradeInput {
  assessment_id: string;
  student_id: string;
  score: number | null;
  is_absent: boolean;
  is_excused?: boolean;
}

export interface SubjectResult {
  subject_id: string;
  subject_name: string;
  teacher_name: string | null;
  coefficient: number;
  average: number | null;
  rank: number | null;
  class_average: number | null;
  min_average: number | null;
  max_average: number | null;
  position: number;
}

export interface StudentResult {
  student_id: string;
  average: number | null;
  rank: number | null;
  mention: string | null;
  passed: boolean | null;
  lines: SubjectResult[];
}

export interface ClassResult {
  students: StudentResult[];
  class_average: number | null;
  class_size: number;
  pass_rate: number | null;
}

export function roundScore(value: number, decimals: number, mode: GradingPolicy["rounding"]): number {
  const f = 10 ** decimals;
  // Correct binary floating point artefacts before rounding (e.g. 1.005 * 100).
  const scaled = Number((value * f).toPrecision(12));
  const r = mode === "down" ? Math.floor(scaled) : mode === "up" ? Math.ceil(scaled) : Math.round(scaled);
  return r / f;
}

/** Standard competition ranking, highest value first. Null values are not ranked. */
export function competitionRank(values: Map<string, number | null>): Map<string, number | null> {
  const sorted = [...values.entries()].filter((e): e is [string, number] => e[1] !== null).sort((a, b) => b[1] - a[1]);
  const ranks = new Map<string, number | null>();
  let previous: number | null = null;
  let previousRank = 0;
  sorted.forEach(([id, v], index) => {
    const rank = previous !== null && v === previous ? previousRank : index + 1;
    ranks.set(id, rank);
    previous = v;
    previousRank = rank;
  });
  for (const [id, v] of values) if (v === null) ranks.set(id, null);
  return ranks;
}

export function mentionFor(average: number | null, policy: GradingPolicy): string | null {
  if (average === null) return null;
  const sorted = [...policy.mentions].sort((a, b) => b.min - a.min);
  return sorted.find((m) => average >= m.min)?.label ?? null;
}

/** Normalised contribution of one grade, or null when it must be excluded. */
function gradeValue(g: GradeInput, a: AssessmentInput, policy: GradingPolicy): number | null {
  if (g.is_absent) {
    const rule = g.is_excused ? policy.excused_policy : policy.missing_policy;
    return rule === "zero" ? 0 : null;
  }
  if (g.score === null || g.score === undefined) return null;
  return (g.score / a.max_score) * policy.scale_max;
}

export function computeSubjectAverage(
  grades: GradeInput[],
  assessments: Map<string, AssessmentInput>,
  policy: GradingPolicy,
): number | null {
  let sum = 0;
  let weights = 0;
  for (const g of grades) {
    const a = assessments.get(g.assessment_id);
    if (!a) continue;
    const v = gradeValue(g, a, policy);
    if (v === null) continue;
    sum += v * a.coefficient;
    weights += a.coefficient;
  }
  return weights > 0 ? roundScore(sum / weights, policy.decimals, policy.rounding) : null;
}

export function computeGeneralAverage(lines: { average: number | null; coefficient: number }[], policy: GradingPolicy): number | null {
  let sum = 0;
  let weights = 0;
  for (const l of lines) {
    if (l.average === null) continue;
    sum += l.average * l.coefficient;
    weights += l.coefficient;
  }
  return weights > 0 ? roundScore(sum / weights, policy.decimals, policy.rounding) : null;
}

function stats(values: (number | null)[], policy: GradingPolicy) {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length) return { avg: null, min: null, max: null };
  return {
    avg: roundScore(v.reduce((s, x) => s + x, 0) / v.length, policy.decimals, policy.rounding),
    min: Math.min(...v),
    max: Math.max(...v),
  };
}

/** Computes every student's report-card figures for a class and a period. */
export function computeClassResults(input: {
  studentIds: string[];
  subjects: SubjectInput[];
  assessments: AssessmentInput[];
  grades: GradeInput[];
  policy?: GradingPolicy;
}): ClassResult {
  const policy = input.policy ?? DEFAULT_POLICY;
  for (const a of input.assessments) {
    if (!(a.max_score > 0) || !(a.coefficient > 0)) throw new Error(`Invalid assessment ${a.id}`);
  }
  const assessments = new Map(input.assessments.map((a) => [a.id, a]));
  const bySubjectStudent = new Map<string, GradeInput[]>();
  for (const g of input.grades) {
    const a = assessments.get(g.assessment_id);
    if (!a) continue;
    const key = `${a.subject_id}|${g.student_id}`;
    const list = bySubjectStudent.get(key) ?? [];
    list.push(g);
    bySubjectStudent.set(key, list);
  }

  // Subject averages per student
  const subjectAvg = new Map<string, Map<string, number | null>>(); // subject -> student -> avg
  for (const s of input.subjects) {
    const m = new Map<string, number | null>();
    for (const st of input.studentIds) {
      m.set(st, computeSubjectAverage(bySubjectStudent.get(`${s.subject_id}|${st}`) ?? [], assessments, policy));
    }
    subjectAvg.set(s.subject_id, m);
  }

  const subjectRanks = new Map<string, Map<string, number | null>>();
  const subjectStats = new Map<string, ReturnType<typeof stats>>();
  for (const s of input.subjects) {
    const m = subjectAvg.get(s.subject_id)!;
    subjectRanks.set(s.subject_id, policy.ranking_enabled ? competitionRank(m) : new Map());
    subjectStats.set(s.subject_id, stats([...m.values()], policy));
  }

  const general = new Map<string, number | null>();
  const students: StudentResult[] = input.studentIds.map((st) => {
    const lines: SubjectResult[] = input.subjects.map((s, i) => {
      const st_ = subjectStats.get(s.subject_id)!;
      return {
        subject_id: s.subject_id,
        subject_name: s.subject_name,
        teacher_name: s.teacher_name ?? null,
        coefficient: s.coefficient,
        average: subjectAvg.get(s.subject_id)!.get(st) ?? null,
        rank: subjectRanks.get(s.subject_id)!.get(st) ?? null,
        class_average: st_.avg,
        min_average: st_.min,
        max_average: st_.max,
        position: s.position ?? i,
      };
    });
    const average = computeGeneralAverage(lines, policy);
    general.set(st, average);
    return { student_id: st, average, rank: null, mention: mentionFor(average, policy), passed: average === null ? null : average >= policy.passing_mark, lines };
  });

  const ranks = policy.ranking_enabled ? competitionRank(general) : new Map<string, number | null>();
  for (const s of students) s.rank = ranks.get(s.student_id) ?? null;

  const ranked = students.filter((s) => s.average !== null);
  return {
    students,
    class_average: stats([...general.values()], policy).avg,
    class_size: input.studentIds.length,
    pass_rate: ranked.length ? ranked.filter((s) => s.passed).length / ranked.length : null,
  };
}
