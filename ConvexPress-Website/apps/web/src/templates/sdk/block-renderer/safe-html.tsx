import { sanitizeBlockHtml } from "../block-data/portable/html";
export { sanitizeBlockHtml } from "../block-data/portable/html";
import type { BlockProps } from "./model";
import "./utilities.css";
export function SafeHtml({ attrs }: BlockProps<"core/custom-html">) {
	return (
		<div
			className="cp-library-safe-html"
			dangerouslySetInnerHTML={{ __html: sanitizeBlockHtml(attrs.html) }}
		/>
	);
}
