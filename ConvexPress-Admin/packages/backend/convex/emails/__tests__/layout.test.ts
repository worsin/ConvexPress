/**
 * The email layer (upstream PR 038): every email carries the site's name, not
 * the platform's; its links work in a mail client (absolute); its plain-text
 * part is clean text (no head, no raw entities, no template indentation); and
 * settings are read at their documented types.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { decodeHtmlEntities, getEmailSettings, parseTemplateVariables, stripHtmlToText } from "../../helpers/email";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/emails/internals.ts": () => import("../internals"),
};

async function site(values: { general?: Record<string, unknown>; email?: Record<string, unknown>; dashboard?: Record<string, unknown> }) {
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1,
    });
    for (const [section, sectionValues] of Object.entries(values)) {
      if (section !== "general" && section !== "email" && section !== "dashboard") continue;
      await ctx.db.insert("settings", { section, values: sectionValues, updatedAt: 1, updatedBy: admin });
    }
  });
  return t;
}

describe("plain text", () => {
  test("drops the head, decodes entities once, keeps links readable, and tidies indentation", () => {
    const html = `<!DOCTYPE html><html><head><title>ConvexPress</title><style>p{color:red}</style></head>
      <body>
        <h1>Clinic</h1>
        <p>Hi Casey,
           your plan &amp; card are set &mdash; thanks.</p>
        <p>Literal: &amp;lt;b&amp;gt; and &#169; and &#x2014;</p>
        <a href="https://clinic.example/dashboard/subscriptions">Manage your subscription</a>
        <a href="https://clinic.example/a?x=1&amp;y=2">https://clinic.example/a?x=1&amp;y=2</a>
        <ul><li class="item">One</li><li>Two</li></ul>
        <p>&copy; 2026 Clinic. All rights reserved.</p>
      </body></html>`;
    const text = stripHtmlToText(html);
    expect(text).not.toContain("ConvexPress");
    expect(text).not.toContain("color:red");
    expect(text).toContain("Hi Casey,\nyour plan & card are set — thanks.");
    expect(text).toContain("Literal: &lt;b&gt; and © and —");
    expect(text).toContain("Manage your subscription (https://clinic.example/dashboard/subscriptions)");
    expect(text).toContain("https://clinic.example/a?x=1&y=2\n");
    expect(text).toContain("- One\n- Two");
    expect(text).toContain("© 2026 Clinic. All rights reserved.");
    expect(text.split("\n").every((line) => line === line.trim())).toBe(true);
  });

  test("entities decode in one pass; unknown ones stay", () => {
    expect(decodeHtmlEntities("&amp;amp; &unknown; &#0; &#65;")).toBe("&amp; &unknown; &#0; A");
  });
});

describe("variables", () => {
  test("parse to strings; anything else is dropped; non-objects are refused", () => {
    expect(parseTemplateVariables('{"a":"x","n":2,"b":true,"o":{"x":1},"z":null}')).toEqual({ a: "x", n: "2", b: "true" });
    expect(parseTemplateVariables("[1,2]")).toBeNull();
    expect(parseTemplateVariables("{nope")).toBeNull();
  });
});

describe("settings", () => {
  test("the sender and links default to the site; the preferences link follows the dashboard path", async () => {
    const t = await site({
      general: { siteTitle: "Clinic", siteUrl: "https://clinic.example/" },
      email: { enabled: true, rateLimit: "fast" },
      dashboard: { basePath: "/account" },
    });
    const settings = await t.run((ctx) => getEmailSettings(ctx));
    expect(settings).toMatchObject({
      siteName: "Clinic",
      fromName: "Clinic",
      unsubscribeUrl: "https://clinic.example/account/settings",
      rateLimit: 50,
      enabled: true,
    });
  });

  test("a site's own sender name and preferences page are kept, made absolute", async () => {
    const t = await site({
      general: { siteTitle: "Clinic", siteUrl: "https://clinic.example" },
      email: { fromName: "Clinic Billing", unsubscribeUrl: "/email-preferences" },
    });
    const settings = await t.run((ctx) => getEmailSettings(ctx));
    expect(settings.fromName).toBe("Clinic Billing");
    expect(settings.unsubscribeUrl).toBe("https://clinic.example/email-preferences");
  });

  test("a queued email carries the site's name and an absolute preferences link in both parts", async () => {
    const t = await site({
      general: { siteTitle: "Clinic", siteUrl: "https://clinic.example" },
      email: { enabled: true },
    });
    await t.mutation(internal.emails.internals.bootstrapTemplates, {});
    await t.mutation(internal.emails.internals.queueEmail, {
      templateSlug: "subscription-paused",
      variables: JSON.stringify({ offer_title: "Growth", recipient_name: "Casey", portal_url: "https://clinic.example/dashboard/subscriptions" }),
      recipientEmail: "casey@example.invalid",
    });
    const email = await t.run(async (ctx) => (await ctx.db.query("emailQueue").collect())[0]);
    expect(email?.fromName).toBe("Clinic");
    expect(email?.bodyHtml).toContain("<title>Clinic</title>");
    expect(email?.bodyHtml).toContain('href="https://clinic.example/dashboard/settings"');
    expect(email?.bodyText).not.toContain("ConvexPress");
    expect(email?.bodyText).not.toContain("&copy;");
    expect(email?.bodyText).toContain("Manage email preferences (https://clinic.example/dashboard/settings)");
    expect(email?.bodyText).toMatch(/© \d{4} Clinic\. All rights reserved\./);
  });
});
