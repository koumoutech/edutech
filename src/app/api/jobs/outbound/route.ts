import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/auth/security";
import { serverEnv } from "@/server/env";
import { deliver, nextAttemptDelaySeconds, type OutboundMessage } from "@/server/messaging/delivery";
import { getBranding } from "@/server/platform";
import { createAdminClient } from "@/server/supabase/admin";

const BATCH = 50;

/**
 * Background worker for the e-mail/SMS queue. Triggered by the platform scheduler
 * (e.g. Vercel Cron) with `Authorization: Bearer <CRON_SECRET>`.
 * Uses the service role (documented privileged use) only to read/update the queue.
 */
export async function GET(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { productName } = await getBranding();
  const { data: queued, error } = await admin
    .from("outbound_messages")
    .select("id, channel, recipient, subject, body, attempts, max_attempts")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(BATCH);
  if (error) return NextResponse.json({ error: "queue unavailable" }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const m of (queued ?? []) as OutboundMessage[]) {
    // Claim the message (prevents double sending when two workers overlap).
    const { data: claimed } = await admin.from("outbound_messages").update({ status: "sending" }).eq("id", m.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue;
    const attempts = m.attempts + 1;
    const result = await deliver(m, productName);
    if (result.ok) {
      sent++;
      await admin.from("outbound_messages").update({ status: "sent", attempts, sent_at: new Date().toISOString(), provider_message_id: result.providerId ?? null, last_error: null }).eq("id", m.id);
    } else {
      failed++;
      const giveUp = result.permanent || attempts >= m.max_attempts;
      await admin
        .from("outbound_messages")
        .update({
          status: giveUp ? "failed" : "queued",
          attempts,
          last_error: result.error ?? "unknown",
          next_attempt_at: new Date(Date.now() + nextAttemptDelaySeconds(attempts) * 1000).toISOString(),
        })
        .eq("id", m.id);
    }
  }
  return NextResponse.json({ processed: (queued ?? []).length, sent, failed });
}
