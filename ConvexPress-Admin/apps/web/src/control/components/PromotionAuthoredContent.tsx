import type { ReactNode } from "react";

type Node = { type: string; text?: string; marks?: { type: string }[]; content?: Node[] };
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
/** A bounded, explicit subset of article nodes. Unknown embeds never become HTML or network requests. */
export function parseReviewArticle(value: unknown): { nodes: Node[]; requiresPreview: boolean } | null {
  if (typeof value !== "string" || value.length > 100_000) return null;
  let count = 0; let requiresPreview = false;
  function parseNode(input: unknown, depth: number): Node {
    if (++count > 4000 || depth > 20 || !isObject(input) || typeof input.type !== "string") throw new Error("Invalid article");
    if (!["doc", "text", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak", "horizontalRule"].includes(input.type)) {
      requiresPreview = true; return { type: "unsupported" };
    }
    if (input.text !== undefined && typeof input.text !== "string") throw new Error("Invalid text");
    if (input.content !== undefined && !Array.isArray(input.content)) throw new Error("Invalid children");
    const marks = Array.isArray(input.marks) ? input.marks.flatMap(mark => isObject(mark) && typeof mark.type === "string" ? [{ type: mark.type }] : []) : undefined;
    if (marks?.some(mark => !["bold", "italic", "underline", "strike", "code"].includes(mark.type))) requiresPreview = true;
    return { type: input.type, text: input.text as string | undefined, marks, content: Array.isArray(input.content) ? input.content.map(child => parseNode(child, depth + 1)) : undefined };
  }
  try {
    const document = parseNode(JSON.parse(value), 0);
    return document.type === "doc" ? { nodes: document.content ?? [], requiresPreview } : null;
  } catch { return null; }
}
function ArticleNode({ node }: { node: Node }) {
  const children = node.content?.map((child, index) => <ArticleNode key={index} node={child} />);
  switch (node.type) {
    case "text": {
      let text: ReactNode = node.text ?? "";
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = <strong>{text}</strong>;
        else if (mark.type === "italic") text = <em>{text}</em>;
        else if (mark.type === "underline") text = <u>{text}</u>;
        else if (mark.type === "strike") text = <s>{text}</s>;
        else if (mark.type === "code") text = <code className="rounded bg-muted px-1">{text}</code>;
      }
      return <>{text}</>;
    }
    case "paragraph": return <p className="my-2 whitespace-pre-wrap">{children}</p>;
    case "heading": return <h5 className="my-3 font-semibold">{children}</h5>;
    case "bulletList": return <ul className="my-2 list-disc pl-5">{children}</ul>;
    case "orderedList": return <ol className="my-2 list-decimal pl-5">{children}</ol>;
    case "listItem": return <li>{children}</li>;
    case "blockquote": return <blockquote className="my-2 border-l-2 pl-3 italic">{children}</blockquote>;
    case "codeBlock": return <pre className="overflow-auto rounded bg-muted p-2"><code>{children}</code></pre>;
    case "hardBreak": return <br />;
    case "horizontalRule": return <hr className="my-3" />;
    default: return null;
  }
}
import { promotionDataSchemas, promotionSyncedReviewDataSchema } from '../../../../../packages/site-contract/src/content-promotion';
export function PromotionAuthoredContent({ data, kind, planLabels = {}, documentLabels = {} }: { data: Record<string, unknown>; kind?:string; planLabels?: Record<string, string>; documentLabels?:Record<string,string> }) {
  const routing=kind==='localeRouting'?promotionDataSchemas.localeRouting.safeParse(data):null;
  const group=kind==='localeGroup'?promotionDataSchemas.localeGroup.safeParse(data):null;
  const synced = promotionSyncedReviewDataSchema.safeParse(data);
  const fields = [
    ["Title", data.title ?? data.name], ["Slug", data.slug], ["Path", data.path], ["Status", data.status],
    ["Visibility", data.visibility], ["Excerpt", data.excerpt], ["Summary", data.summary],
    ["Currency", data.currency],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);
  const article = parseReviewArticle(data.content);
  const needsWebsitePreview = data.contentMode === "blocks" || Array.isArray(data.blocks) || (!!data.content && !article) || article?.requiresPreview;
  return <div className="mt-3 space-y-3 text-sm">
    {routing?.success && <section aria-label="Site languages" className="space-y-2 rounded border border-border p-3">
      <p className="font-medium">{routing.data.enabled?'Language links are enabled':'Language links are disabled'}</p>
      <ul className="space-y-2">{routing.data.locales.map(locale=><li key={locale.code}><strong>{locale.label} ({locale.code})</strong> · {locale.direction==='rtl'?'Right to left':'Left to right'}<br/>Landing page: {documentLabels[locale.landingPageId]??'Destination needs review'}</li>)}</ul>
      {!routing.data.locales.length&&<p>No language landing pages configured.</p>}
      <p className="text-ink-2">These settings replace the production language configuration. Destinations use the corresponding production pages.</p>
    </section>}
    {group?.success && <section aria-label="Translation group" className="space-y-2 rounded border border-border p-3">
      <p className="font-medium">Translation group: {group.data.key}</p>
      {group.data.translations.length?<ul>{group.data.translations.map(entry=><li key={entry.code}>{entry.code}: {documentLabels[entry.documentId]??'Destination needs review'}</li>)}</ul>:<p>Remove all translations from this group.</p>}
      <p className="text-ink-2">This replaces the complete group, including removal of old assignments. Other production groups are preserved.</p>
    </section>}
    {synced.success && <section aria-label="Reusable content revisions" className="space-y-2 rounded border border-border p-3">
      <p className="font-medium">Reusable content · {synced.data.revisions.length} published {synced.data.revisions.length === 1 ? 'revision' : 'revisions'} included</p>
      <ul className="space-y-1">{synced.data.revisions.map(version => <li key={version.revision}>Revision {version.revision}: {version.title}{version.revision === synced.data.publishedRevision ? ' · Current publication' : ' · Required by a pinned placement'}</li>)}</ul>
      <p className="text-ink-2">Production receives new revision numbers. Pinned placements are remapped, shared placements follow the imported publication, and existing production history is retained.</p>
      <p className="text-ink-2">Preview the destination website to verify nested blocks and forms.</p>
    </section>}
    {data.resourceType === "route" && <section aria-label="Site access rule" className="space-y-2 rounded border border-border p-3">
      <p className="font-medium">URL pattern: {String(data.resourceIdOrKey)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt>Rule</dt><dd>{data.ruleMode === "allow_only" ? "Allow-only rule" : "Require matching access"}</dd>
        <dt>Group</dt><dd>{typeof data.policyGroup === "string" ? data.policyGroup : "Default"}</dd>
        <dt>Anonymous access</dt><dd>Blocked by membership rules</dd>
        <dt>Access prompt</dt><dd>{data.loginRequired ? "Sign in" : "Membership required"}</dd>
        <dt>Membership plans</dt><dd>{Array.isArray(data.planIds) && data.planIds.length ? data.planIds.map(id => planLabels[String(id)] ?? String(id)).join(", ") : "No plan required"}</dd>
        <dt>Required capabilities</dt><dd>{Array.isArray(data.requiredCapabilities) && data.requiredCapabilities.length ? data.requiredCapabilities.map(String).join(", ") : "None"}</dd>
        <dt>When access is denied</dt><dd>{data.teaserMode === "custom_message" ? "Show the custom message" : data.teaserMode === "excerpt" ? "Show an excerpt" : "Hide content"}</dd>
      </dl>
      {typeof data.customMessage === "string" && <p className="whitespace-pre-wrap">{data.customMessage}</p>}
      <p className="text-ink-2">This rule applies to every matching URL. Separate rule groups must all pass.</p>
    </section>}
    {fields.length > 0 && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">{fields.map(([label, value]) => <div key={label} className="contents"><dt className="font-medium text-ink-2">{label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>}
    {article && <section aria-label="Article text" className="max-h-96 overflow-auto rounded border border-border p-3">{article.nodes.map((node, index) => <ArticleNode key={index} node={node} />)}</section>}
    {needsWebsitePreview && <p className="text-ink-2">Blocks, embeds, or unsupported formatting require a website preview to check their appearance.</p>}
  </div>;
}
