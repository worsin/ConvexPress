import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkifiedText } from "./LinkifiedText";

test("authored HTML and entities remain literal prose", () => {
	const html = renderToStaticMarkup(
		<LinkifiedText text={'<img src=x onerror="alert(1)"> &lt;script&gt; **words**'} />,
	);
	expect(html).not.toContain("<img");
	expect(html).toContain("&lt;img");
	expect(html).toContain("&amp;lt;script&amp;gt;");
	expect(html).toContain("**words**");
});

test("HTTP links retain their query and protect their new browsing context", () => {
	const html = renderToStaticMarkup(
		<LinkifiedText text="Read https://example.com/?a=1&b=2 then http://example.org." />,
	);
	expect(html.match(/<a /g)?.length).toBe(2);
	expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
	expect(html).toContain('rel="noopener noreferrer"');
	expect(html).toContain(" then ");
});

test("URL quotes cannot create attributes and script schemes remain text", () => {
	const html = renderToStaticMarkup(
		<LinkifiedText text={'https://example.com/"onmouseover="alert(1) javascript:alert(2) <script>alert(3)</script>'} />,
	);
	expect(html).toContain('href="https://example.com/&quot;onmouseover=&quot;alert(1)"');
	expect(html).not.toContain('<script>');
	expect(html).not.toContain('href="javascript:');
	expect(html).toContain("javascript:alert(2)");
});
