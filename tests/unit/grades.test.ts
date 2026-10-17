import { describe, expect, it } from "vitest";
import {
  competitionRank,
  computeClassResults,
  computeGeneralAverage,
  computeSubjectAverage,
  DEFAULT_POLICY,
  mentionFor,
  roundScore,
  type AssessmentInput,
} from "@/features/grades/domain";

const A = (id: string, subject: string, max = 20, coef = 1): AssessmentInput => ({ id, subject_id: subject, max_score: max, coefficient: coef });

describe("roundScore", () => {
  it("rounds half up without floating point surprises", () => {
    expect(roundScore(12.345, 2, "half_up")).toBe(12.35);
    expect(roundScore(1.005, 2, "half_up")).toBe(1.01);
    expect(roundScore(12.349, 1, "down")).toBe(12.3);
    expect(roundScore(12.301, 1, "up")).toBe(12.4);
  });
});

describe("competitionRank", () => {
  it("gives equal ranks to ties and skips the following rank", () => {
    const r = competitionRank(new Map<string, number | null>([["a", 15], ["b", 12], ["c", 15], ["d", 10], ["e", null]]));
    expect(r.get("a")).toBe(1);
    expect(r.get("c")).toBe(1);
    expect(r.get("b")).toBe(3);
    expect(r.get("d")).toBe(4);
    expect(r.get("e")).toBeNull();
  });
});

describe("computeSubjectAverage", () => {
  const assessments = new Map([
    ["t1", A("t1", "m", 20, 1)],
    ["t2", A("t2", "m", 10, 2)],
  ]);

  it("normalises scores to the scale and weights by assessment coefficient", () => {
    // t1: 12/20 → 12 (coef 1); t2: 8/10 → 16 (coef 2) ⇒ (12 + 32) / 3 = 14.67
    const avg = computeSubjectAverage(
      [
        { assessment_id: "t1", student_id: "s", score: 12, is_absent: false },
        { assessment_id: "t2", student_id: "s", score: 8, is_absent: false },
      ],
      assessments,
      DEFAULT_POLICY,
    );
    expect(avg).toBe(14.67);
  });

  it("excludes absences by default and counts them as zero when configured", () => {
    const grades = [
      { assessment_id: "t1", student_id: "s", score: 16, is_absent: false },
      { assessment_id: "t2", student_id: "s", score: null, is_absent: true },
    ];
    expect(computeSubjectAverage(grades, assessments, DEFAULT_POLICY)).toBe(16);
    expect(computeSubjectAverage(grades, assessments, { ...DEFAULT_POLICY, missing_policy: "zero" })).toBe(5.33);
  });

  it("treats excused absences with their own rule", () => {
    const grades = [
      { assessment_id: "t1", student_id: "s", score: 16, is_absent: false },
      { assessment_id: "t2", student_id: "s", score: null, is_absent: true, is_excused: true },
    ];
    expect(computeSubjectAverage(grades, assessments, { ...DEFAULT_POLICY, missing_policy: "zero", excused_policy: "exclude" })).toBe(16);
  });

  it("returns null without any usable grade", () => {
    expect(computeSubjectAverage([], assessments, DEFAULT_POLICY)).toBeNull();
  });

  it("supports a /100 scale", () => {
    const avg = computeSubjectAverage([{ assessment_id: "t1", student_id: "s", score: 15, is_absent: false }], assessments, {
      ...DEFAULT_POLICY,
      scale_max: 100,
    });
    expect(avg).toBe(75);
  });
});

describe("computeGeneralAverage", () => {
  it("weights subjects by coefficient and skips subjects without grades", () => {
    expect(
      computeGeneralAverage(
        [
          { average: 15, coefficient: 4 },
          { average: 10, coefficient: 2 },
          { average: null, coefficient: 3 },
        ],
        DEFAULT_POLICY,
      ),
    ).toBe(13.33);
  });
});

describe("mentionFor", () => {
  it("returns the highest matching mention", () => {
    expect(mentionFor(16.5, DEFAULT_POLICY)).toBe("Très bien");
    expect(mentionFor(10, DEFAULT_POLICY)).toBe("Passable");
    expect(mentionFor(4, DEFAULT_POLICY)).toBe("Insuffisant");
    expect(mentionFor(null, DEFAULT_POLICY)).toBeNull();
  });
});

describe("computeClassResults", () => {
  const subjects = [
    { subject_id: "math", subject_name: "Mathématiques", coefficient: 4 },
    { subject_id: "fr", subject_name: "Français", coefficient: 2 },
  ];
  const assessments = [A("m1", "math"), A("m2", "math", 20, 2), A("f1", "fr")];
  const grades = [
    { assessment_id: "m1", student_id: "alice", score: 18, is_absent: false },
    { assessment_id: "m2", student_id: "alice", score: 16, is_absent: false },
    { assessment_id: "f1", student_id: "alice", score: 12, is_absent: false },
    { assessment_id: "m1", student_id: "bob", score: 8, is_absent: false },
    { assessment_id: "m2", student_id: "bob", score: 9, is_absent: false },
    { assessment_id: "f1", student_id: "bob", score: 14, is_absent: false },
    { assessment_id: "m1", student_id: "carl", score: null, is_absent: true },
  ];

  const result = computeClassResults({ studentIds: ["alice", "bob", "carl"], subjects, assessments, grades });

  it("computes per-subject and general averages, ranks and mentions", () => {
    const alice = result.students.find((s) => s.student_id === "alice")!;
    const bob = result.students.find((s) => s.student_id === "bob")!;
    // alice math: (18 + 32)/3 = 16.67 ; fr 12 ; general (16.67*4 + 12*2)/6 = 15.11
    expect(alice.lines[0].average).toBe(16.67);
    expect(alice.average).toBe(15.11);
    expect(alice.rank).toBe(1);
    expect(alice.mention).toBe("Bien");
    expect(alice.passed).toBe(true);
    // bob math: (8 + 18)/3 = 8.67 ; fr 14 ; general (34.68 + 28)/6 = 10.45
    expect(bob.average).toBe(10.45);
    expect(bob.rank).toBe(2);
  });

  it("does not rank a student without grades", () => {
    const carl = result.students.find((s) => s.student_id === "carl")!;
    expect(carl.average).toBeNull();
    expect(carl.rank).toBeNull();
    expect(carl.passed).toBeNull();
  });

  it("computes class statistics", () => {
    expect(result.class_size).toBe(3);
    expect(result.class_average).toBe(12.78);
    expect(result.pass_rate).toBe(1);
    const mathLine = result.students[0].lines[0];
    expect(mathLine.max_average).toBe(16.67);
    expect(mathLine.min_average).toBe(8.67);
  });

  it("can disable ranking", () => {
    const r = computeClassResults({ studentIds: ["alice", "bob"], subjects, assessments, grades, policy: { ...DEFAULT_POLICY, ranking_enabled: false } });
    expect(r.students.every((s) => s.rank === null)).toBe(true);
  });

  it("rejects invalid assessments", () => {
    expect(() => computeClassResults({ studentIds: [], subjects, assessments: [A("x", "math", 0)], grades: [] })).toThrow();
  });
});
