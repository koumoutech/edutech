import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { AppError, toActionError, type ActionResult } from "@/server/errors";

/**
 * Wraps a server action body: maps errors to safe messages and lets Next.js
 * control-flow errors (redirect, notFound) propagate.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    unstable_rethrow(e);
    return toActionError(e);
  }
}

/** Validates input (FormData or object) and throws a VALIDATION AppError with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: FormData | Record<string, unknown>): z.infer<S> {
  const raw = input instanceof FormData ? formDataToObject(input) : input;
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new AppError("VALIDATION", "Certaines informations sont invalides.", fieldErrors);
  }
  return result.data;
}

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") {
      out[key] = value;
      continue;
    }
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      const list = Array.isArray(out[k]) ? (out[k] as string[]) : [];
      list.push(value);
      out[k] = list;
    } else {
      out[key] = value;
    }
  }
  return out;
}
