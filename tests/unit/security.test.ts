import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

describe("security helpers", () => {
  it("only allows internal post-login redirects", async () => {
    const { safeNextPath } = await import("@/server/auth/security");
    expect(safeNextPath("/app/students?x=1")).toBe("/app/students?x=1");
    expect(safeNextPath("/invitation/abc")).toBe("/invitation/abc");
    expect(safeNextPath("https://evil.example.com")).toBe("/app");
    expect(safeNextPath("//evil.example.com")).toBe("/app");
    expect(safeNextPath("/\\evil.example.com")).toBe("/app");
    expect(safeNextPath("/api/export/students")).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
  });

  it("compares secrets in constant time and rejects length mismatch", async () => {
    const { safeEqual } = await import("@/server/auth/security");
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abd", "Bearer abc")).toBe(false);
    expect(safeEqual("short", "much longer value")).toBe(false);
  });

  it("produces random tokens and stable fingerprints that do not expose the input", async () => {
    const { randomToken, fingerprint } = await import("@/server/auth/security");
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken(32).length).toBeGreaterThanOrEqual(43);
    const fp = fingerprint("parent@example.test");
    expect(fp).toBe(fingerprint("parent@example.test"));
    expect(fp).not.toContain("parent");
  });
});
