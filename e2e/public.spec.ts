import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page presents the product and flags illustrative figures", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Les visuels et chiffres de cette page sont illustratifs.")).toBeVisible();
    await expect(page.getByRole("link", { name: /connexion|se connecter/i }).first()).toBeVisible();
  });

  test("landing page has no horizontal overflow", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("login form has labelled fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
    await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /se connecter/i })).toBeVisible();
  });

  test("legal pages are reachable", async ({ page }) => {
    for (const path of ["/legal/mentions", "/legal/confidentialite", "/legal/conditions"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("unknown pages return 404", async ({ page }) => {
    const res = await page.goto("/cette-page-n-existe-pas");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Page introuvable")).toBeVisible();
  });
});

test.describe("security", () => {
  for (const path of ["/", "/login"]) {
    test(`page ${path} loads without console errors (CSP compatible, hydrated)`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }

  test("responses carry security headers", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  for (const path of ["/app", "/app/students", "/app/finance", "/app/assistant", "/app/settings/roles"]) {
    test(`protected page ${path} requires authentication`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("platform console requires authentication", async ({ page }) => {
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login/);
  });

  test("exports refuse anonymous requests", async ({ request }) => {
    for (const path of [
      "/api/export/students",
      "/api/export/grades",
      "/api/export/invoices",
      "/api/export/attendance",
    ]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([401, 403], path).toContain(res.status());
    }
  });

  test("background job endpoint rejects calls without the cron secret", async ({ request }) => {
    const res = await request.get("/api/jobs/outbound", { headers: { authorization: "Bearer wrong" } });
    expect(res.status()).toBe(401);
  });
});
