import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseReviewArticle, PromotionAuthoredContent } from "./PromotionAuthoredContent";
test("readable authored fields and article marks are escaped and preserve list structure", () => {
  const content = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<img onerror=alert(1)>", marks: [{ type: "bold" }, { type: "italic" }, { type: "link", attrs: { href: "javascript:alert(1)" } }] }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Carefully made" }] }] }] }] });
  const html = renderToStaticMarkup(<PromotionAuthoredContent data={{ title: "Materials and care", slug: "care", status: "draft", content }} />);
  expect(html).toContain("Materials and care"); expect(html).toContain("<dt"); expect(html).toContain("<em><strong>&lt;img"); expect(html).toContain("<ul"); expect(html).toContain("Carefully made"); expect(html).not.toContain("<img "); expect(html).not.toContain("javascript:");
});
test("embeds and block layouts require website preview without fetching or fabricating their rendering", () => {
  const content = JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: "https://private.example/image.png" } }] });
  const html = renderToStaticMarkup(<PromotionAuthoredContent data={{ content, contentMode: "blocks", blocks: [] }} />);
  expect(html).toContain("require a website preview"); expect(html).not.toContain("private.example"); expect(html).not.toContain("<img");
  expect(parseReviewArticle('{')).toBeNull(); expect(parseReviewArticle('<script>alert(1)</script>')).toBeNull();
});
test("site access review exposes URL scope, named plans, groups and escaped denial text",()=>{
 const html=renderToStaticMarkup(<PromotionAuthoredContent data={{resourceType:"route",resourceIdOrKey:"/members/*",policyGroup:"paid",ruleMode:"allow_only",planIds:["@promotion:plan:studio"],requiredCapabilities:["studio.read"],loginRequired:true,teaserMode:"custom_message",customMessage:"<script>private</script>"}} planLabels={{"@promotion:plan:studio":"Studio membership"}} />);
 expect(html).toContain("/members/*");expect(html).toContain("Studio membership");expect(html).toContain("paid");expect(html).toContain("studio.read");expect(html).toContain("Separate rule groups must all pass");expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");
});
test("canonical promotion without legacy fields still requires Website preview", () => {
  const html = renderToStaticMarkup(<PromotionAuthoredContent kind="page" data={{
    title: "Canonical page", blocksVersion: 2, content: "", canonical: { contract: "canonical-promotion-tree-v1", blocks: [], references: [] },
  }} />);
  expect(html).toContain("Canonical page");
  expect(html).toContain("require a website preview");
  expect(html).not.toContain('aria-label="Article text"');
});
