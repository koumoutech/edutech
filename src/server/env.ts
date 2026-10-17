import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

/** Server-only configuration. Never import this module from client components. */
const serverSchema = z.object({
  APP_ENV: z.enum(["development", "preview", "staging", "production", "test"]).default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  /** Salt used to hash e-mails / IPs in security logs and rate-limit keys. */
  SECURITY_HASH_SALT: z.string().min(16).optional(),
  /** One-time secret required to create the first platform administrator. */
  SETUP_TOKEN: z.string().min(24).optional(),
  /** Shared secret for scheduled jobs (outbound queue processing). */
  CRON_SECRET: z.string().min(24).optional(),

  AI_PROVIDER: z.enum(["anthropic", "disabled"]).default("disabled"),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  AI_MODEL: z.string().min(3).default("claude-opus-5-5"),
  /** Must be explicitly enabled once a DPA with the AI provider is in place. */
  AI_ALLOW_PERSONAL_DATA: bool,
  AI_MAX_TOOL_ROUNDS: z.coerce.number().int().min(1).max(8).default(5),

  EMAIL_PROVIDER: z.enum(["resend", "log", "disabled"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("EduDigi <no-reply@example.com>"),
  SMS_PROVIDER: z.enum(["twilio", "log", "disabled"]).default("disabled"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid server configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function isAiConfigured(): boolean {
  const env = serverEnv();
  return env.AI_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY);
}
