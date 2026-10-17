import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("outbound delivery helpers", () => {
  it("backs off exponentially and caps at 6 hours", async () => {
    const { nextAttemptDelaySeconds } = await import("@/server/messaging/delivery");
    expect(nextAttemptDelaySeconds(1)).toBe(60);
    expect(nextAttemptDelaySeconds(2)).toBe(240);
    expect(nextAttemptDelaySeconds(3)).toBe(960);
    expect(nextAttemptDelaySeconds(20)).toBe(21600);
  });

  it("escapes user content in e-mails (no HTML injection)", async () => {
    const { emailHtml } = await import("@/server/messaging/delivery");
    const html = emailHtml("<b>Sujet</b>", "<script>alert(1)</script> & co", "EduDigi");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
    expect(html).toContain("&lt;b&gt;Sujet&lt;/b&gt;");
  });

  it("logs instead of sending in 'log' mode and refuses when disabled", async () => {
    vi.resetModules();
    process.env.EMAIL_PROVIDER = "log";
    process.env.SMS_PROVIDER = "disabled";
    const { deliver } = await import("@/server/messaging/delivery");
    const base = { id: "1", recipient: "a@b.c", subject: "S", body: "B", attempts: 0, max_attempts: 5 };
    expect(await deliver({ ...base, channel: "email" }, "EduDigi")).toEqual({ ok: true, providerId: "log" });
    expect(await deliver({ ...base, channel: "sms" }, "EduDigi")).toMatchObject({ ok: false, permanent: true });
  });
});
