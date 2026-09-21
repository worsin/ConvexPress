import type { EditorFormValues } from "@/types/editor";

type StructuredValues = Pick<
	EditorFormValues,
	"hero" | "topics" | "summary" | "sources" | "tableOfContents" | "pagePrompt"
>;

/** Keep the original article editor even after its final section is cleared. */
export function usesOriginalArticleEditor(source: {
	contentMode?: string;
	hero?: unknown;
	topics?: unknown;
	summary?: unknown;
	sources?: unknown;
	tableOfContents?: unknown;
}): boolean {
	return (
		source.contentMode !== "blocks" &&
		[
			source.hero,
			source.topics,
			source.summary,
			source.sources,
			source.tableOfContents,
		].some((value) => value !== undefined)
	);
}

/** Omit untouched sections, but send explicit empty values for removals. */
export function structuredArticlePatch(
	values: StructuredValues,
	baseline: StructuredValues,
) {
	const changed = (key: keyof StructuredValues) =>
		JSON.stringify(values[key]) !== JSON.stringify(baseline[key]);
	const hero = values.hero;
	const summary = values.summary;
	return {
		...(changed("hero")
			? {
					hero: {
						title: hero.title || undefined,
						subtitle: hero.subtitle || undefined,
						content: hero.content || undefined,
						imageId: hero.imageId || undefined,
						videoUrl: hero.videoUrl || undefined,
						ctaText: hero.ctaText || undefined,
						ctaUrl: hero.ctaUrl || undefined,
					},
				}
			: {}),
		...(changed("topics")
			? {
					topics: values.topics.map((topic) => ({
						title: topic.title || undefined,
						subtitle: topic.subtitle || undefined,
						content: topic.content || undefined,
						imageId: topic.imageId || undefined,
						videoUrl: topic.videoUrl || undefined,
					})),
				}
			: {}),
		...(changed("summary")
			? {
					summary: {
						title: summary.title || undefined,
						content: summary.content || undefined,
					},
				}
			: {}),
		...(changed("sources") ? { sources: values.sources } : {}),
		...(changed("tableOfContents")
			? { tableOfContents: values.tableOfContents }
			: {}),
		...(changed("pagePrompt") ? { pagePrompt: values.pagePrompt } : {}),
	};
}
