import { describe, expect, it } from "vitest";
import { findConflicts, overlaps, scheduledMinutesByKey, toMinutes, type Slot } from "@/features/timetable/domain";

const base: Slot = {
  id: "e1",
  weekday: 1,
  starts_at: "08:00",
  ends_at: "09:00",
  class_id: "6A",
  teacher_id: "T1",
  room_id: "R1",
};

describe("overlaps", () => {
  it("treats touching slots as non-overlapping", () => {
    expect(overlaps(base, { weekday: 1, starts_at: "09:00", ends_at: "10:00" })).toBe(false);
    expect(overlaps(base, { weekday: 1, starts_at: "08:59", ends_at: "10:00" })).toBe(true);
    expect(overlaps(base, { weekday: 2, starts_at: "08:00", ends_at: "09:00" })).toBe(false);
  });
});

describe("findConflicts", () => {
  it("detects class, teacher and room conflicts separately", () => {
    const candidate: Slot = {
      weekday: 1,
      starts_at: "08:30",
      ends_at: "09:30",
      class_id: "6B",
      teacher_id: "T1",
      room_id: "R1",
    };
    const kinds = findConflicts(candidate, [base]).map((c) => c.kind);
    expect(kinds).toEqual(["teacher", "room"]);
    const sameClass: Slot = {
      weekday: 1,
      starts_at: "08:30",
      ends_at: "09:30",
      class_id: "6A",
      teacher_id: "T2",
      room_id: "R2",
    };
    expect(findConflicts(sameClass, [base]).map((c) => c.kind)).toEqual(["class"]);
  });

  it("ignores the edited entry itself and rejects inverted times", () => {
    expect(findConflicts({ ...base }, [base])).toEqual([]);
    expect(findConflicts({ ...base, id: undefined, starts_at: "10:00", ends_at: "09:00" }, [])[0].kind).toBe("invalid");
  });

  it("uses names in messages", () => {
    const c = findConflicts(
      { weekday: 1, starts_at: "08:00", ends_at: "08:30", class_id: "x", teacher_id: "T1", room_id: null },
      [base],
      {
        teachers: new Map([["T1", "Jean KOUASSI"]]),
      },
    );
    expect(c[0].message).toContain("Jean KOUASSI");
  });
});

describe("scheduledMinutesByKey", () => {
  it("sums durations", () => {
    expect(toMinutes("07:30:00")).toBe(450);
    const m = scheduledMinutesByKey(
      [
        { k: "a", starts_at: "08:00", ends_at: "09:00" },
        { k: "a", starts_at: "10:00", ends_at: "10:30" },
      ],
      (s) => s.k,
    );
    expect(m.get("a")).toBe(90);
  });
});
