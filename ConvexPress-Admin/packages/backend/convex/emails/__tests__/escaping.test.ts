/**
 * Template values are text (upstream PR 070): a name, a ticket subject or a
 * site title can't add markup, links or scripts to an email's HTML, while the
 * subject and the plain-text part read exactly as typed.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import schema from "../../schema";
import { escapeHtml, queueEmailForEvent, renderHtmlTemplate, renderTemplate } from "../../helpers/email";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/bootstrap/requiredRecords.ts": () => import("../../bootstrap/requiredRecords"),
  "./convex/emails/internals.ts": () => import("../internals"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
};

const HOSTILE = `Casey <img src=x onerror="alert(1)"> & "Co"`;

describe("rendering", () => {
  test("HTML templates escape values; text templates keep them as typed", () => {
    const template = `<a href="{url}" title="{name}">Hi {name}</a>`;
    expect(renderHtmlTemplate(template, { name: HOSTILE, url: `https://x.example/?a=1&b="2"` })).toBe(
      `<a href="https://x.example/?a=1&amp;b=&quot;2&quot;" title="Casey &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;Co&quot;">Hi Casey &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;Co&quot;</a>`,
    );
    expect(renderTemplate("Hi {name}", { name: HOSTILE })).toBe(`Hi ${HOSTILE}`);
    expect(renderHtmlTemplate("{missing} stays", {})).toBe("{missing} stays");
    expect(escapeHtml(`'`)).toBe("&#39;");
  });

  test("only the server-built post list is inserted as markup", () => {
    expect(renderHtmlTemplate("<ul>{post_list}</ul>", { post_list: "<li>Ready</li>" })).toBe("<ul><li>Ready</li></ul>");
  });
});

describe("a queued email", () => {
  test("carries a hostile name as text in its HTML, subject and plain text", async () => {
    const t = convexTest({ schema, modules });
    await t.mutation(internal.bootstrap.requiredRecords.ensure, {});
    await t.run(async (ctx) => {
      const admin = await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("settings", { section: "general", values: { siteTitle: "Smith & <Sons>" }, updatedAt: 1, updatedBy: admin });
      await queueEmailForEvent(ctx, "welcome-email", { recipientEmail: "casey@example.invalid", recipientName: HOSTILE, variables: {} });
    });
    const [email] = await t.run(async (ctx) => await ctx.db.query("emailQueue").collect());
    if (!email) throw new Error("no email was queued");
    expect(email.bodyHtml).not.toContain("<img");
    expect(email.bodyHtml).toContain("Welcome, Casey &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;Co&quot;!");
    expect(email.bodyHtml).toContain("Smith &amp; &lt;Sons&gt;");
    expect(email.subject).toBe("Welcome to Smith & <Sons>!");
    expect(email.bodyText).toContain(`Welcome, ${HOSTILE}!`);
  });
});
