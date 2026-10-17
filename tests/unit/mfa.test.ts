import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
});
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
  },
}));

const user = {
  id: "u1",
  email: "a@example.test",
  fullName: "A",
  avatarPath: null,
  theme: "system",
  mfaEnabled: true,
  mfaPending: true,
};
vi.mock("@/server/auth/session", () => ({ getSessionUser: vi.fn(async () => user) }));

const events: string[] = [];
let allowed = true;
vi.mock("@/server/auth/security", () => ({
  consumeRateLimit: vi.fn(async () => allowed),
  resetRateLimit: vi.fn(async () => undefined),
  recordLoginEvent: vi.fn(async (e: string) => {
    events.push(e);
  }),
  safeNextPath: (n: string) => (n.startsWith("/app") ? n : "/app"),
}));

const mfa = {
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(async () => ({ error: null })),
  enroll: vi.fn(),
};
vi.mock("@/server/supabase/server", () => ({ createClient: async () => ({ auth: { mfa } }) }));

const FACTOR = "11111111-2222-4333-8444-555555555555";
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  allowed = true;
  user.mfaPending = true;
  mfa.listFactors.mockResolvedValue({
    data: { totp: [{ id: FACTOR, status: "verified" }], all: [{ id: FACTOR, status: "verified" }] },
    error: null,
  });
});

describe("MFA login challenge", () => {
  it("rejects a malformed code without calling Supabase", async () => {
    const { verifyMfaChallenge } = await import("@/features/auth/mfa-actions");
    const res = await verifyMfaChallenge(null, fd({ code: "12ab", next: "/app" }));
    expect(res.ok).toBe(false);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("logs a failure on a wrong code", async () => {
    mfa.challengeAndVerify.mockResolvedValueOnce({ error: { message: "invalid" } });
    const { verifyMfaChallenge } = await import("@/features/auth/mfa-actions");
    const res = await verifyMfaChallenge(null, fd({ code: "123456", next: "/app" }));
    expect(res.ok).toBe(false);
    expect(events).toContain("mfa_failure");
  });

  it("is rate limited", async () => {
    allowed = false;
    const { verifyMfaChallenge } = await import("@/features/auth/mfa-actions");
    const res = await verifyMfaChallenge(null, fd({ code: "123456", next: "/app" }));
    expect(res.ok).toBe(false);
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("redirects to a safe path after a valid code", async () => {
    mfa.challengeAndVerify.mockResolvedValueOnce({ error: null });
    const { verifyMfaChallenge } = await import("@/features/auth/mfa-actions");
    await expect(verifyMfaChallenge(null, fd({ code: "123456", next: "https://evil.example" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/app");
    expect(events).toContain("mfa_success");
  });
});

describe("MFA settings", () => {
  it("cannot be changed from a session that has not passed the second factor", async () => {
    const { startMfaEnrollment, disableMfa } = await import("@/features/auth/mfa-actions");
    expect((await startMfaEnrollment()).ok).toBe(false);
    expect((await disableMfa("123456")).ok).toBe(false);
    expect(mfa.enroll).not.toHaveBeenCalled();
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("enrolment clears abandoned unverified factors first", async () => {
    user.mfaPending = false;
    mfa.listFactors.mockResolvedValueOnce({
      data: { totp: [], all: [{ id: "old", status: "unverified" }] },
      error: null,
    });
    mfa.enroll.mockResolvedValueOnce({
      data: { id: FACTOR, totp: { qr_code: "data:image/svg+xml;...", secret: "S" } },
      error: null,
    });
    const { startMfaEnrollment } = await import("@/features/auth/mfa-actions");
    const res = await startMfaEnrollment();
    expect(res.ok).toBe(true);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "old" });
  });

  it("disabling requires a valid current code before removing the factor", async () => {
    user.mfaPending = false;
    mfa.challengeAndVerify.mockResolvedValueOnce({ error: { message: "invalid" } });
    const { disableMfa } = await import("@/features/auth/mfa-actions");
    expect((await disableMfa("000000")).ok).toBe(false);
    expect(mfa.unenroll).not.toHaveBeenCalled();
    mfa.challengeAndVerify.mockResolvedValueOnce({ error: null });
    expect((await disableMfa("123456")).ok).toBe(true);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: FACTOR });
    expect(events).toContain("mfa_disabled");
  });
});
