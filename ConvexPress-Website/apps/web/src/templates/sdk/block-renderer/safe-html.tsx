import { sanitize } from "../../../lib/html-sanitizer";
import type { BlockProps } from "./model";
import "./utilities.css";
/** Raw HTML cannot define page IDs, scripts, form controls, media or style escape hatches. */
export function sanitizeBlockHtml(html: string) {
	return sanitize(html, {
		ALLOWED_TAGS: [
			"p",
			"br",
			"hr",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"strong",
			"em",
			"s",
			"u",
			"code",
			"pre",
			"blockquote",
			"ul",
			"ol",
			"li",
			"dl",
			"dt",
			"dd",
			"a",
			"table",
			"thead",
			"tbody",
			"tfoot",
			"tr",
			"th",
			"td",
			"caption",
		],
		ALLOWED_ATTR: [
			"href",
			"title",
			"target",
			"rel",
			"colspan",
			"rowspan",
			"scope",
		],
	});
}
export function SafeHtml({ attrs }: BlockProps<"core/custom-html">) {
	return (
		<div
			className="cp-library-safe-html"
			dangerouslySetInnerHTML={{ __html: sanitizeBlockHtml(attrs.html) }}
		/>
	);
}
