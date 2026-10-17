import { describe, expect, it } from "vitest";
import { classLoadStatus, splitIntoTerms, teacherOverloads } from "@/features/classes/domain";

describe("classLoadStatus", () => {
  it("flags classes close to or above capacity", () => {
    expect(classLoadStatus({ id: "a", name: "6e A", capacity: 40, enrolled: 20 })).toBe("ok");
    expect(classLoadStatus({ id: "a", name: "6e A", capacity: 40, enrolled: 36 })).toBe("near_full");
    expect(classLoadStatus({ id: "a", name: "6e A", capacity: 40, enrolled: 40 })).toBe("full");
    expect(classLoadStatus({ id: "a", name: "6e A", capacity: 40, enrolled: 41 })).toBe("over");
  });
});

describe("teacherOverloads", () => {
  it("compares assigned hours with the contract or the default maximum", () => {
    const res = teacherOverloads(
      [
        { teacher_id: "t1", weekly_hours: 12 },
        { teacher_id: "t1", weekly_hours: 14 },
        { teacher_id: "t2", weekly_hours: 20 },
        { teacher_id: "t3", weekly_hours: 10 },
        { teacher_id: null, weekly_hours: 50 },
      ],
      new Map([["t2", 18]]),
    );
    expect(res.get("t1")).toEqual({ assigned: 26, max: 24 });
    expect(res.get("t2")).toEqual({ assigned: 20, max: 18 });
    expect(res.has("t3")).toBe(false);
  });
});

describe("splitIntoTerms", () => {
  it("creates contiguous, non-overlapping terms covering the year", () => {
    const terms = splitIntoTerms("2026-09-07", "2027-07-02", 3);
    expect(terms).toHaveLength(3);
    expect(terms[0].starts_on).toBe("2026-09-07");
    expect(terms[2].ends_on).toBe("2027-07-02");
    for (let i = 1; i < terms.length; i++) {
      const prevEnd = new Date(`${terms[i - 1].ends_on}T00:00:00Z`).getTime();
      const start = new Date(`${terms[i].starts_on}T00:00:00Z`).getTime();
      expect(start - prevEnd).toBe(86_400_000);
    }
    expect(terms.map((t) => t.name)).toEqual(["1er trimestre", "2e trimestre", "3e trimestre"]);
  });

  it("names semesters", () => {
    expect(splitIntoTerms("2026-09-01", "2027-06-30", 2).map((t) => t.name)).toEqual(["1er semestre", "2e semestre"]);
  });
});
