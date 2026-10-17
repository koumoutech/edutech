import "server-only";
import { serverEnv } from "@/server/env";

export interface OutboundMessage {
  id: string;
  channel: "email" | "sms" | "push";
  recipient: string;
  subject: string | null;
  body: string;
  attempts: number;
  max_attempts: number;
}

export interface DeliveryResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  /** Permanent errors are not retried (invalid recipient, provider not configured...). */
  permanent?: boolean;
}

/** Exponential backoff: 1 min, 4 min, 16 min, 64 min… capped at 6 h. */
export function nextAttemptDelaySeconds(attempts: number): number {
  return Math.min(60 * 4 ** Math.max(0, attempts - 1), 6 * 3600);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function emailHtml(subject: string, body: string, productName: string): string {
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#F4F6F5;padding:24px;color:#171C19">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
<div style="background:#16834A;color:#fff;padding:16px 20px;font-weight:bold">${escapeHtml(productName)}</div>
<div style="padding:20px"><h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h1>
<p style="white-space:pre-line;line-height:1.5">${escapeHtml(body)}</p></div>
<div style="padding:12px 20px;color:#6B756F;font-size:12px">Message automatique — gérez vos préférences de notification dans votre espace.</div>
</div></body></html>`;
}

async function sendEmail(m: OutboundMessage, productName: string): Promise<DeliveryResult> {
  const env = serverEnv();
  if (env.EMAIL_PROVIDER === "disabled") return { ok: false, error: "email disabled", permanent: true };
  if (env.EMAIL_PROVIDER === "log") {
    console.info(`[email:log] to=<redacted> subject="${m.subject ?? ""}"`);
    return { ok: true, providerId: "log" };
  }
  if (!env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY missing", permanent: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [m.recipient],
      subject: m.subject ?? productName,
      text: m.body,
      html: emailHtml(m.subject ?? productName, m.body, productName),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) return { ok: true, providerId: ((await res.json()) as { id?: string }).id };
  return { ok: false, error: `resend ${res.status}`, permanent: res.status === 422 || res.status === 400 };
}

async function sendSms(m: OutboundMessage): Promise<DeliveryResult> {
  const env = serverEnv();
  if (env.SMS_PROVIDER === "disabled") return { ok: false, error: "sms disabled", permanent: true };
  if (env.SMS_PROVIDER === "log") {
    console.info("[sms:log] to=<redacted>");
    return { ok: true, providerId: "log" };
  }
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM)
    return { ok: false, error: "twilio not configured", permanent: true };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: m.recipient, From: env.TWILIO_FROM, Body: m.body.slice(0, 600) }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) return { ok: true, providerId: ((await res.json()) as { sid?: string }).sid };
  return { ok: false, error: `twilio ${res.status}`, permanent: res.status === 400 };
}

export async function deliver(m: OutboundMessage, productName: string): Promise<DeliveryResult> {
  try {
    if (m.channel === "email") return await sendEmail(m, productName);
    if (m.channel === "sms") return await sendSms(m);
    return { ok: false, error: "push not configured", permanent: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown error" };
  }
}
