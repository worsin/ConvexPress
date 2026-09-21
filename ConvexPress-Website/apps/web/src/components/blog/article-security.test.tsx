import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { StructuredContent } from "./StructuredContent";
import { BlockContentRenderer } from "./BlockContentRenderer";
import { sanitizeHref } from "@/lib/security/url";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
	JSDOM: new (html: string) => { window: { document: Document } };
};

const documentFor = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
	new JSDOM(renderToStaticMarkup(element)).window.document;

test("article CTAs reject active schemes and browser URL normalization escapes", () => {
	for (const ctaUrl of ["javascript:alert(1)", "data:text/html,test", "java\nscript:alert(1)", "/\\example.com", "/\n/example.com", "//example.com"]) {
		expect(sanitizeHref(ctaUrl)).toBeUndefined();
		const doc = documentFor(<StructuredContent hero={{ ctaText: "Original label", ctaUrl }} />);
		expect(doc.querySelector("a")).toBeNull();
		expect(doc.body.textContent).toContain("Original label");
	}
	for (const ctaUrl of ["/contact", "#details", "mailto:hello@example.com", "tel:+18005550123", "HTTPS://example.com/contact"]) {
		const doc = documentFor(<StructuredContent hero={{ ctaText: "Contact", ctaUrl }} />);
		expect(doc.querySelector("a")?.getAttribute("href")).toBe(ctaUrl);
		if (ctaUrl.startsWith("HTTPS")) expect(doc.querySelector("a")?.rel).toBe("noopener noreferrer");
	}
});

test("both article renderers use reviewed embeds with no iframe in server HTML", () => {
	for (const src of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://vimeo.com/76979871"]) {
		for (const element of [
			<StructuredContent topics={[{ title: "Video", videoUrl: src }]} />,
			<BlockContentRenderer content={{ type: "doc", content: [{ type: "embed", attrs: { src } }] }} />,
		]) {
			const doc = documentFor(element);
			expect(doc.querySelector("iframe")).toBeNull();
			expect(doc.querySelector("button")?.textContent).toContain("Load video");
			expect(doc.querySelector("a")?.rel).toBe("noopener noreferrer");
		}
	}
});

test("unknown embed hosts stay links, while unsafe embed URLs cannot load or navigate", () => {
	for (const src of ["https://example.com/video", "https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "/account"]) {
		const doc = documentFor(<BlockContentRenderer content={{ type: "doc", content: [{ type: "embed", attrs: { src, provider: "youtube" } }] }} />);
		expect(doc.querySelector("iframe,button")).toBeNull();
		if (src.startsWith("https:")) expect(doc.querySelector("a")?.getAttribute("href")).toBe(src);
		else expect(doc.querySelector("a")).toBeNull();
	}
});

test("real structured body and sources render malicious markup literally", () => {
	const text = '<img src=x onerror="alert(1)"> https://example.com/"onclick="bad';
	const doc = documentFor(<StructuredContent hero={{ content: text }} sources={text} />);
	expect(doc.querySelector("img,script,[onclick],[onerror]")).toBeNull();
	expect(doc.querySelector('[data-slot="structured-hero"]')?.textContent).toBe(text);
	expect(doc.querySelector('[data-slot="structured-sources"] li')?.textContent).toBe(text);
	expect(doc.querySelectorAll("a").length).toBe(2);
});

test("legacy rich-text marks, buttons and linked media share the URL boundary", () => {
	const doc = documentFor(<BlockContentRenderer content={{ type: "doc", content: [
		{ type: "paragraph", content: [{ type: "text", text: "Kept text", marks: [{ type: "link", attrs: { href: "java\nscript:alert(1)" } }] }] },
		{ type: "button", attrs: { text: "Kept button label", url: "data:text/html,test" } },
		{ type: "image", attrs: { src: "https://example.com/image.jpg", linkTo: "custom", linkUrl: "javascript:alert(1)" } },
		{ type: "image", attrs: { src: "data:image/svg+xml,test", linkTo: "media" } },
		{ type: "gallery", attrs: { columns: 2 }, content: [{ type: "image", attrs: { src: "file:///private/image" } }] },
	] }} />);
	expect(doc.querySelector("a")).toBeNull();
	expect(doc.querySelectorAll("img").length).toBe(1);
	expect(doc.querySelector("img")?.src).toBe("https://example.com/image.jpg");
	expect(doc.body.textContent).toContain("Kept text");
	expect(doc.body.textContent).toContain("Kept button label");
	const safe = documentFor(<BlockContentRenderer content={{ type: "doc", content: [
		{ type: "paragraph", content: [{ type: "text", text: "Visit", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank", rel: "nofollow" } }] }] },
	] }} />);
	expect(safe.querySelector("a")?.rel).toBe("nofollow noopener noreferrer");
});
