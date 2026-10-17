import { describe, expect, it } from "vitest";
import {
  isOverdue,
  lineDiscount,
  planAllocation,
  recoveryRate,
  splitInstallments,
  validateAllocations,
} from "@/features/finance/domain";

const invoices = [
  { id: "b", number: "FAC-2", due_date: "2026-11-15", issue_date: "2026-09-10", balance: 100000 },
  { id: "a", number: "FAC-1", due_date: "2026-10-05", issue_date: "2026-09-10", balance: 25000 },
  { id: "c", number: "FAC-3", due_date: "2027-01-15", issue_date: "2026-09-10", balance: 0 },
];

describe("planAllocation", () => {
  it("pays the oldest due invoices first, partially if needed", () => {
    expect(planAllocation(60000, invoices)).toEqual({
      allocations: [
        { invoice_id: "a", amount: 25000 },
        { invoice_id: "b", amount: 35000 },
      ],
      rest: 0,
    });
  });

  it("reports the unallocatable rest (overpayment)", () => {
    expect(planAllocation(130000, invoices).rest).toBe(5000);
  });

  it("handles cents without floating point drift", () => {
    const res = planAllocation(0.3, [
      { id: "x", number: "X", due_date: "2026-01-01", issue_date: "2026-01-01", balance: 0.1 + 0.2 },
    ]);
    expect(res).toEqual({ allocations: [{ invoice_id: "x", amount: 0.3 }], rest: 0 });
  });
});

describe("validateAllocations", () => {
  it("accepts an exact split", () => {
    expect(
      validateAllocations(
        30000,
        [
          { invoice_id: "a", amount: 25000 },
          { invoice_id: "b", amount: 5000 },
        ],
        invoices,
      ),
    ).toBeNull();
  });
  it("rejects over-allocation, unknown invoices and mismatched totals", () => {
    expect(validateAllocations(30000, [{ invoice_id: "a", amount: 30000 }], invoices)).toMatch(/dépasse/);
    expect(validateAllocations(10, [{ invoice_id: "zzz", amount: 10 }], invoices)).toMatch(/inconnue/);
    expect(validateAllocations(30000, [{ invoice_id: "b", amount: 20000 }], invoices)).toMatch(/égale/);
    expect(validateAllocations(0, [], invoices)).toMatch(/positif/);
  });
});

describe("lineDiscount", () => {
  it("combines percent and fixed discounts for the matching category and caps at the amount", () => {
    const discounts = [
      { kind: "percent" as const, value: 10, applies_to_category: "tuition" },
      { kind: "fixed" as const, value: 5000, applies_to_category: null },
      { kind: "percent" as const, value: 50, applies_to_category: "canteen" },
    ];
    expect(lineDiscount(200000, "tuition", discounts)).toBe(25000);
    expect(lineDiscount(3000, "registration", discounts)).toBe(3000);
  });
});

describe("splitInstallments", () => {
  it("assigns the rounding remainder to the last installment", () => {
    const parts = splitInstallments(100000, [
      { due_on: "2026-10-15", percent: 33.33 },
      { due_on: "2027-01-15", percent: 33.33 },
      { due_on: "2027-04-15", percent: 33.34 },
    ]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(100000);
    expect(parts[0].amount).toBe(33330);
  });
  it("rejects plans that do not total 100 %", () => {
    expect(() => splitInstallments(1000, [{ due_on: "2026-10-15", percent: 50 }])).toThrow();
  });
});

describe("isOverdue / recoveryRate", () => {
  it("only flags open invoices past their due date", () => {
    expect(isOverdue({ status: "issued", due_date: "2026-10-01", balance: 10 }, "2026-10-17")).toBe(true);
    expect(isOverdue({ status: "paid", due_date: "2026-10-01", balance: 0 }, "2026-10-17")).toBe(false);
    expect(isOverdue({ status: "draft", due_date: "2026-10-01", balance: 10 }, "2026-10-17")).toBe(false);
    expect(isOverdue({ status: "partially_paid", due_date: "2026-10-30", balance: 10 }, "2026-10-17")).toBe(false);
  });
  it("computes recovery", () => {
    expect(recoveryRate(200, 150)).toBe(0.75);
    expect(recoveryRate(0, 0)).toBeNull();
  });
});
