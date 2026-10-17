import "server-only";
import { z } from "zod";
import { canSchoolWide } from "@/lib/authz";
import type { AppContext } from "@/server/auth/session";
import { assertCan } from "@/server/auth/session";
import { AppError, fromDbError, unwrap, unwrapList } from "@/server/errors";

export const announcementSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(10000),
  priority: z.enum(["normal", "important", "urgent"]).default("normal"),
  audience_roles: z.array(z.string().regex(/^[a-z0-9_]{2,48}$/)).max(20).default([]),
  audience_class_ids: z.array(z.uuid()).max(100).default([]),
  is_pinned: z.literal("on").optional().transform((v) => v === "on"),
  expires_at: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59`).toISOString() : null)),
  publish: z.literal("on").optional().transform((v) => v === "on"),
});

export async function listAnnouncements(ctx: AppContext) {
  assertCan(ctx, "announcements.read");
  return unwrapList(
    await ctx.db
      .from("announcements")
      .select("id, title, body, priority, status, is_pinned, audience_roles, audience_class_ids, published_at, expires_at, created_at")
      .eq("school_id", ctx.school.id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  );
}

export async function saveAnnouncement(ctx: AppContext, input: z.infer<typeof announcementSchema>) {
  assertCan(ctx, "announcements.create", ["school"]);
  const row = {
    title: input.title,
    body: input.body,
    priority: input.priority,
    audience_roles: input.audience_roles,
    audience_class_ids: input.audience_class_ids,
    is_pinned: input.is_pinned,
    expires_at: input.expires_at,
  };
  const id = input.id
    ? unwrap(await ctx.db.from("announcements").update(row).eq("id", input.id).select("id").single()).id
    : unwrap(await ctx.db.from("announcements").insert({ ...row, school_id: ctx.school.id, author_id: ctx.user.id, status: "draft" }).select("id").single()).id;
  if (input.publish) await publishAnnouncement(ctx, id);
  return id;
}

export async function publishAnnouncement(ctx: AppContext, id: string) {
  assertCan(ctx, "announcements.publish", ["school"]);
  const { data, error } = await ctx.db.rpc("publish_announcement", { p_id: id });
  if (error) throw fromDbError(error);
  return data ?? 0;
}

export async function archiveAnnouncement(ctx: AppContext, id: string) {
  assertCan(ctx, "announcements.create", ["school"]);
  const { error } = await ctx.db.from("announcements").update({ status: "archived" }).eq("id", id);
  if (error) throw fromDbError(error);
}

export async function listNotifications(ctx: AppContext, page = 1) {
  const from = (page - 1) * 30;
  const { data, error, count } = await ctx.db
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at", { count: "exact" })
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .range(from, from + 29);
  if (error) throw fromDbError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export const NOTIFICATION_TYPES: Record<string, string> = {
  "attendance.absence": "Absences et retards",
  "grade.published": "Notes publiées",
  "report_card.published": "Bulletins publiés",
  "invoice.issued": "Nouvelles factures",
  "payment.received": "Paiements reçus",
  announcement: "Annonces",
  "announcement.urgent": "Annonces urgentes",
  "message.received": "Messages",
  "leave.reviewed": "Décisions de congé",
  "timetable.changed": "Changements d'emploi du temps",
  "justification.reviewed": "Justificatifs d'absence",
};

export async function notificationPreferences(ctx: AppContext) {
  const { data } = await ctx.db.from("notification_preferences").select("type, channel, enabled").eq("user_id", ctx.user.id);
  return data ?? [];
}

export async function setPreference(ctx: AppContext, type: string, channel: "in_app" | "email" | "sms", enabled: boolean) {
  if (!(type in NOTIFICATION_TYPES)) throw new AppError("VALIDATION");
  const { error } = await ctx.db
    .from("notification_preferences")
    .upsert({ user_id: ctx.user.id, type, channel, enabled }, { onConflict: "user_id,type,channel" });
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export async function listThreads(ctx: AppContext) {
  assertCan(ctx, "messages.create");
  const { data, error } = await ctx.db
    .from("message_threads")
    .select("id, subject, last_message_at, created_by, message_participants(user_id, last_read_at)")
    .eq("school_id", ctx.school.id)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw fromDbError(error);
  return (data ?? []).map((t) => {
    const me = t.message_participants.find((p) => p.user_id === ctx.user.id);
    return { ...t, unread: !me?.last_read_at || me.last_read_at < t.last_message_at };
  });
}

/** Directory of people the user may write to (families → staff only; enforced again in start_thread). */
export async function messageRecipients(ctx: AppContext) {
  const { data } = await ctx.db.rpc("message_directory", { p_school: ctx.school.id });
  return (data ?? []) as { user_id: string; full_name: string; role_names: string }[];
}

export async function getThread(ctx: AppContext, id: string) {
  const { data: thread } = await ctx.db.from("message_threads").select("id, subject, school_id, student_id").eq("id", id).maybeSingle();
  if (!thread) throw new AppError("NOT_FOUND");
  const [messages, participants] = await Promise.all([
    ctx.db.from("messages").select("id, body, created_at, sender_id").eq("thread_id", id).order("created_at"),
    ctx.db.rpc("thread_participants", { p_thread: id }),
  ]);
  await ctx.db.from("message_participants").update({ last_read_at: new Date().toISOString() }).eq("thread_id", id).eq("user_id", ctx.user.id);
  return { thread, messages: messages.data ?? [], participants: (participants.data ?? []) as { user_id: string; full_name: string }[] };
}

export async function startThread(ctx: AppContext, subject: string, recipients: string[], body: string) {
  assertCan(ctx, "messages.create");
  const { data, error } = await ctx.db.rpc("start_thread", { p_school: ctx.school.id, p_subject: subject, p_recipients: recipients, p_body: body });
  if (error) throw fromDbError(error);
  return data as string;
}

export async function reply(ctx: AppContext, threadId: string, body: string) {
  assertCan(ctx, "messages.create");
  const { error } = await ctx.db.from("messages").insert({ thread_id: threadId, school_id: ctx.school.id, sender_id: ctx.user.id, body });
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// Administrative requests
// ---------------------------------------------------------------------------

export const requestSchema = z.object({
  kind: z.enum(["certificate", "transcript", "transfer", "appointment", "information", "complaint", "other"]),
  subject: z.string().trim().min(3).max(160),
  details: z.string().trim().max(4000).optional(),
  student_id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  preferred_date: z.string().optional().transform((v) => (v ? new Date(v).toISOString() : null)),
});

export async function listRequests(ctx: AppContext) {
  return unwrapList(
    await ctx.db
      .from("admin_requests")
      .select("id, kind, subject, details, status, resolution, preferred_date, created_at, requester_id, student:students!admin_requests_school_id_student_id_fkey(id, first_name, last_name)")
      .eq("school_id", ctx.school.id)
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

export async function createRequest(ctx: AppContext, input: z.infer<typeof requestSchema>) {
  assertCan(ctx, "requests.create");
  const { error } = await ctx.db.from("admin_requests").insert({
    school_id: ctx.school.id,
    requester_id: ctx.user.id,
    kind: input.kind,
    subject: input.subject,
    details: input.details ?? null,
    student_id: input.student_id ?? null,
    preferred_date: input.preferred_date,
  });
  if (error) throw fromDbError(error);
}

export async function updateRequest(ctx: AppContext, id: string, status: "in_progress" | "done" | "rejected" | "cancelled", resolution?: string) {
  if (status === "cancelled") {
    const { error } = await ctx.db.from("admin_requests").update({ status }).eq("id", id).eq("requester_id", ctx.user.id).eq("status", "open");
    if (error) throw fromDbError(error);
    return;
  }
  assertCan(ctx, "requests.manage", ["school"]);
  const { data, error } = await ctx.db
    .from("admin_requests")
    .update({ status, resolution: resolution ?? null, assigned_to: ctx.user.id })
    .eq("id", id)
    .select("requester_id, subject")
    .single();
  if (error) throw fromDbError(error);
  if (canSchoolWide(ctx, "requests.manage") && data && (status === "done" || status === "rejected")) {
    await ctx.db.rpc("notify_request_update", { p_request: id });
  }
}
