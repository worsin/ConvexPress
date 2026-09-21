import {
	prepareBlocks,
	discoverRenderers,
} from "../src/templates/sdk/block-renderer/model";
import paragraph from "../../../../blocks/core/paragraph/render";
const registry = discoverRenderers({
	"/blocks/core/paragraph/render.tsx": paragraph,
});
const texts = [
	"Care begins with a little attention. Wipe the surface gently after use and let it dry naturally.",
	"Keep the piece away from sudden temperature changes. A soft cloth is all it needs for everyday care.",
	"Made to be used, repaired and enjoyed. The small marks of daily life become part of its story.",
];
const nodes = texts.map((text, index) => {
	const inline = {
		type: "text",
		text,
		...(index === 2 ? { marks: [{ type: "bold" }] } : {}),
	};
	const body = {
		type: "doc",
		content: [{ type: "paragraph", content: [inline] }],
	};
	return {
		id: `article-paragraph-${index}`,
		name: "core/paragraph",
		version: 2,
		attrs: { body },
	};
});
export function ArticleFlow() {
	return (
		<details className="canonical-study" data-article-study>
			<summary>Article rhythm study</summary>
			<div aria-label="Article paragraph flow" data-article-flow-canvas>
				{prepareBlocks(nodes, registry, {
					enabledPlugins: [],
					capabilities: [],
					disabledBlocks: [],
				})}
			</div>
		</details>
	);
}
