/**
 * Every email in the site's look (upstream PR 071): its logo or name, its
 * accent colour on buttons and its footer lines, filled in at send time and
 * escaped, with the site's own identity as the fallback.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { emailBrandVariables, getEmailSettings, injectGlobalVariables, queueEmailForEvent } from "../../helpers/email";
import { validateSectionValues } from "../../settings/validation";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/bootstrap/requiredRecords.ts": () => import("../../bootstrap/requiredRecords"),
  "./convex/emails/internals.ts": () => import("../internals"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
};

async function site(sections: Record<string, Record<string, unknown>>) {
  const t = convexTest({ schema, modules });
  await t.mutation(internal.bootstrap.requiredRecords.ensure, {});
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    for (const [section, values] of Object.entries({ general: { siteTitle: "Smith & Co", siteUrl: "https://smith.example" }, ...sections })) {
      if (section === "general" || section === "email" || section === "footer" || section === "brand") {
        await ctx.db.insert("settings", { section, values, updatedAt: 1, updatedBy: admin });
      }
    }
  });
  const welcome = async () => {
    await t.run(async (ctx) => {
      await queueEmailForEvent(ctx, "welcome-email", { recipientEmail: "casey@example.invalid", recipientName: "Casey", variables: {} });
    });
    const [email] = await t.run(async (ctx) => await ctx.db.query("emailQueue").order("desc").take(1));
    if (!email) throw new Error("no email was queued");
    return email;
  };
  const branding = () => t.run(async (ctx) => (await getEmailSettings(ctx)).branding);
  return { t, welcome, branding };
}

describe("email branding", () => {
  test("without settings, the site's name on the accent band, and nothing left as a placeholder", async () => {
    const s = await site({});
    const email = await s.welcome();
    expect(email.bodyHtml).toContain(`<td style="padding:32px 40px;background-color:#18181b;"><a href="https://smith.example" style="text-decoration:none;"><h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">Smith &amp; Co</h1></a></td>`);
    expect(email.bodyHtml).not.toMatch(/\{(email_header|email_footer|accent_color)\}/);
  });

  test("the site's logo, accent and footer, escaped", async () => {
    const s = await site({
      email: { logoUrl: "https://cdn.example/logo.png?v=1&s=2", logoWidth: 180, accentColor: "#1e4262", footerText: "Smith & Co · 1 Main St\n<b>(555) 555-0100</b>" },
    });
    const html = (await s.welcome()).bodyHtml;
    expect(html).toContain(`border-bottom:4px solid #1e4262;`);
    expect(html).toContain(`<img src="https://cdn.example/logo.png?v=1&amp;s=2" alt="Smith &amp; Co" width="180"`);
    expect(html).toContain(`Smith &amp; Co · 1 Main St<br>&lt;b&gt;(555) 555-0100&lt;/b&gt;`);
    expect(html).toContain(`background-color:#1e4262;color:#ffffff`);
    expect(html).not.toContain("background-color:#18181b;color:#ffffff");
  });

  test("blank settings fall back to the site's own logo and footer contact; SVG logos are skipped", async () => {
    const s = await site({
      brand: { logoUrl: "https://smith.example/logo.svg" },
      footer: { contactInfo: { enabled: true, address: "Las Vegas, Nevada", phone: "(702) 386-0101", email: "info@smith.example" } },
    });
    expect(await s.branding()).toEqual({
      logoUrl: null,
      logoWidth: 160,
      accentColor: "#18181b",
      footerLines: ["Las Vegas, Nevada", "(702) 386-0101 · info@smith.example"],
    });
    const withPng = await site({ general: { siteTitle: "Smith", logoUrl: "https://smith.example/logo.png" }, footer: { contactInfo: { enabled: false, address: "Hidden" } } });
    expect(await withPng.branding()).toMatchObject({ logoUrl: "https://smith.example/logo.png", footerLines: [] });
  });

  test("an edited template keeps its own layout", async () => {
    const s = await site({ email: { accentColor: "#1e4262" } });
    await s.t.run(async (ctx) => {
      const template = await ctx.db.query("emailTemplates").withIndex("by_slug", (q) => q.eq("slug", "welcome-email")).unique();
      if (!template) throw new Error("welcome template missing");
      await ctx.db.patch("emailTemplates", template._id, { bodyHtml: "<p>Hi {recipient_name}</p>", isCustomized: true });
    });
    expect((await s.welcome()).bodyHtml).toBe("<p>Hi Casey</p>");
  });

  test("settings are checked when saved", () => {
    const email = (values: Record<string, unknown>) => validateSectionValues("email", values).map((error) => error.field);
    expect(email({ logoUrl: "https://cdn.example/logo.png", logoWidth: 160, accentColor: "#1E4262", footerText: "ok" })).toEqual([]);
    expect(email({ logoUrl: "http://cdn.example/logo.png" })).toEqual(["logoUrl"]);
    expect(email({ logoUrl: "https://cdn.example/logo.svg" })).toEqual(["logoUrl"]);
    expect(email({ accentColor: "red" })).toEqual(["accentColor"]);
    expect(email({ logoWidth: 9000 })).toEqual(["logoWidth"]);
    expect(email({ footerText: "x".repeat(501) })).toEqual(["footerText"]);
  });

  test("the layout variables can't be replaced by a caller's values", () => {
    const vars = emailBrandVariables({ logoUrl: null, logoWidth: 160, accentColor: "#123456", footerLines: [] }, { siteName: "S", siteUrl: "" });
    expect(vars).toEqual({
      accent_color: "#123456",
      email_header: `<td style="padding:32px 40px;background-color:#123456;"><h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">S</h1></td>`,
      email_footer: "",
    });
    const branding = { logoUrl: null, logoWidth: 160, accentColor: "#123456", footerLines: [] };
    const injected = injectGlobalVariables({ email_header: "<script>x</script>", accent_color: "red" }, { siteName: "S", siteUrl: "", branding });
    expect(injected.email_header).toBe(vars.email_header);
    expect(injected.accent_color).toBe("#123456");
  });
});
