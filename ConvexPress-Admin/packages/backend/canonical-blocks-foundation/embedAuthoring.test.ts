import { expect, test } from "bun:test";
import { validateBlockAttrs } from "./generated/schemas";
import { prepareCanonicalSave, prepareCanonicalPublication, prepareCanonicalRestore } from "./documentState";
import { assertAuthoredActions } from "./authoredDefinitions";
const validateDraft = (name: string, attrs: Record<string, unknown>) => {
  try {
    assertAuthoredActions({ blocks: [{ id: "test", name, version: ["core/booking-cta", "core/embed"].includes(name) ? 2 : 1, attrs }] as any });
    return { ok: true, attrs, issues: [] as { path: (string | number)[] }[] };
  } catch (error: any) {
    return { ok: false, attrs, issues: (error.issues ?? []) as { path: (string | number)[] }[] };
  }
};

const cases = [
  ["core/booking-cta", 2, { ctaUrl: "/contact", ctaLabel: "" }, "ctaLabel"],
  ["blocks/contact-stack", 1, { items: [{ href: "/details", value: "", label: "" }] }, "items.0.value"],
  ["core/embed", 2, { url: "https://example.invalid/video" }, "url"],
  ["core/booking-cta", 2, { embedUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE" }, "embedUrl"],
  ["blocks/contact-stack", 1, { mapEmbedUrl: "https://example.invalid/map" }, "mapEmbedUrl"],
  ["blocks/contact-stack", 1, { items: [{ label: "Details", value: "Read", href: "javascript:void(0)" }] }, "items.0.href"],
  ["core/iframe", 1, { url: { label: "Unreviewed", href: "https://example.invalid/frame" } }, "url.href"],
  ["core/script-embed", 1, { provider: "youtube", resourceId: "too-short" }, "resourceId"],
  ["core/script-embed", 1, { provider: "vimeo", resourceId: "not-numeric" }, "resourceId"],
] as const;

test("unsupported embeds stay readable and recoverable but new saves, publication and native fields require repair", () => {
  for (const [name, version, input, path] of cases) {
    const attrs = validateBlockAttrs(name, input);
    const blocks = [{ id: "external", name, version, attrs }];
    const current = { _id: "page", title: "Embeds", status: "draft", contentMode: "blocks", blocksVersion: 2, blocksRevision: 3, blocks };
    expect(() => prepareCanonicalSave(current, { expectedRevision: 3, title: "Embeds", blocks })).toThrow();
    expect(() => prepareCanonicalPublication(current, { expectedRevision: 3, status: "publish" }, 100)).toThrow();
    expect(prepareCanonicalRestore({ ...current, blocks: [] }, { ...current, parentId: "page" }, { expectedRevision: 3, postId: "page" }).blocks).toEqual(blocks);
    const draft = validateDraft(name, attrs);
    expect(draft.ok).toBe(false);
    expect(draft.issues.some(issue => issue.path.join(".") === path)).toBe(true);
  }
});

test("reviewed providers, optional empty selections and contact links retain their exact authored values", () => {
  for (const [name, attrs] of [
    ["core/embed", { url: "https://player.vimeo.com/video/76979871?h=8272103f6e" }],
    ["core/embed", { url: "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=30s" }],
    ["core/booking-cta", { embedUrl: "https://calendly.com/embed-demo-sales/discovery-call" }],
    ["blocks/contact-stack", { mapEmbedUrl: "https://www.openstreetmap.org/export/embed.html?bbox=-0.15,51.48,-0.1,51.52&layer=mapnik", items: [{ label: "Notes", value: "Read", href: "/notes" }] }],
    ["core/iframe", { url: { label: "Calendar", href: "https://calendly.com/embed-demo-sales/discovery-call" } }],
    ["core/script-embed", { provider: "youtube", resourceId: "M7lc1UVf-VE" }],
    ["core/script-embed", { provider: "vimeo", resourceId: "76979871" }],
    ...["core/embed", "core/booking-cta", "blocks/contact-stack", "core/iframe", "core/script-embed"].map(name => [name, {}]),
  ] as [string, Record<string, unknown>][]) {
    const parsed = validateBlockAttrs(name, attrs);
    const result = validateDraft(name, parsed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attrs).toEqual(parsed);
  }
});
