/**
 * Every placeholder in a shipped template is filled (upstream PR 072): it is
 * one of the template's declared variables (which always get a value, see
 * withDeclaredDefaults) or one the layer injects, and no template uses a
 * double-brace placeholder, which renders as "{value}".
 */
import { expect, test } from "bun:test";
import { DEFAULT_TEMPLATES } from "../templateDefaults";

const INJECTED = new Set(["site_name", "site_url", "current_year", "unsubscribe_url", "recipient_name", "accent_color", "email_header", "email_footer"]);

test("shipped templates only use variables they declare or the layer injects", () => {
  const undeclared: string[] = [];
  for (const template of DEFAULT_TEMPLATES) {
    const declared = new Set(template.availableVariables.map((variable) => variable.name));
    const source = `${template.subjectTemplate}\n${template.bodyHtml}\n${template.preheaderText ?? ""}`;
    for (const [, name] of source.matchAll(/\{(\w+)\}/g)) {
      if (!declared.has(name) && !INJECTED.has(name)) undeclared.push(`${template.slug}: {${name}}`);
    }
  }
  expect(undeclared).toEqual([]);
});

test("no shipped template uses double braces", () => {
  expect(DEFAULT_TEMPLATES.filter((template) => /\{\{|\}\}/.test(`${template.subjectTemplate}${template.bodyHtml}`)).map((template) => template.slug)).toEqual([]);
});

test("ticket emails carry the number, subject, reply and link their handlers send (emails/internals.ts)", async () => {
  const { injectGlobalVariables, renderHtmlTemplate, renderTemplate, withDeclaredDefaults } = await import("../../helpers/email");
  const branding = { logoUrl: null, logoWidth: 160, accentColor: "#123456", footerLines: [] };
  const render = (slug: string, variables: Record<string, string>) => {
    const template = DEFAULT_TEMPLATES.find((candidate) => candidate.slug === slug);
    if (!template) throw new Error(`${slug} missing`);
    const site = { siteName: "Site", siteUrl: "https://site.example", unsubscribeUrl: "https://site.example/dashboard/settings", branding };
    const filled = withDeclaredDefaults(injectGlobalVariables(variables, site), template.availableVariables, site.siteUrl);
    return { subject: renderTemplate(template.subjectTemplate, filled), html: renderHtmlTemplate(template.bodyHtml, filled) };
  };
  const reply = render("ticket_reply_notification", {
    user_name: "Casey", ticket_id: "TKT-202610-00042", subject: "Billing question", reply_excerpt: "We've refunded the charge.", ticket_url: "https://site.example/dashboard/tickets/abc",
  });
  expect(reply.subject).toBe("New reply on ticket TKT-202610-00042: Billing question");
  expect(reply.html).toContain("We&#39;ve refunded the charge.");
  expect(reply.html).toContain('href="https://site.example/dashboard/tickets/abc"');
  const resolved = render("ticket_resolved", { user_name: "Casey", ticket_id: "TKT-202610-00042", subject: "Billing question", rating_url: "https://site.example/r", ticket_url: "https://site.example/t" });
  expect(resolved.subject).toBe("Your ticket TKT-202610-00042 has been resolved");
  for (const { subject, html } of [reply, resolved]) expect(`${subject}${html}`).not.toMatch(/\{\w+\}/);
});
