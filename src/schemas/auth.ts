import { z } from "zod";

export const emailSchema = z.email("Adresse e-mail invalide").max(254).transform((v) => v.trim().toLowerCase());

/** Password policy: 10+ characters with letters and digits; long passphrases are welcome. */
export const passwordSchema = z
  .string()
  .min(10, "Au moins 10 caractères")
  .max(128, "128 caractères maximum")
  .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), "Utilisez des lettres et des chiffres");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis").max(128),
  next: z.string().max(300).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const setPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
    next: z.string().max(300).optional(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Les mots de passe ne correspondent pas" });

export const setupSchema = z.object({
  token: z.string().min(24).max(200),
  fullName: z.string().trim().min(2).max(160),
  email: emailSchema,
  password: passwordSchema,
});
