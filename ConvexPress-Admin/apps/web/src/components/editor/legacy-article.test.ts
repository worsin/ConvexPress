import { expect, test } from "bun:test";
import { usesOriginalArticleEditor } from "./legacy-article";

test("recovered articles stay in their original editor when visible sections are cleared", () => {
	expect(
		usesOriginalArticleEditor({
			contentMode: "article",
			hero: { subtitle: "Visible introduction" },
		}),
	).toBe(true);
	expect(
		usesOriginalArticleEditor({
			contentMode: "article",
			hero: {},
			topics: [],
			summary: {},
			sources: "",
		}),
	).toBe(true);
	expect(
		usesOriginalArticleEditor({ hero: { title: "Retained hidden title" } }),
	).toBe(true);
	expect(
		usesOriginalArticleEditor({
			contentMode: "blocks",
			hero: { subtitle: "Hidden legacy content" },
		}),
	).toBe(false);
	expect(usesOriginalArticleEditor({ contentMode: "article" })).toBe(false);
});
