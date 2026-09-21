import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PromotionSelect } from "./PromotionSelect";
test("all promotion selectors have distinct explicit IDs and exact visible labels outside their options", () => {
	const labels = [
		"Content type",
		"Source staging environment",
		"Target production environment",
	];
	const html = renderToStaticMarkup(
		<>
			{labels.map((label) => (
				<PromotionSelect key={label} label={label} defaultValue="chosen">
					<option value="chosen">An option must not become the label</option>
				</PromotionSelect>
			))}
		</>,
	);
	const renderedLabels = [
		...html.matchAll(/<label for="([^"]+)"[^>]*>([^<]+)<\/label>/g),
	];
	expect(renderedLabels.map((match) => match[2])).toEqual(labels);
	expect(new Set(renderedLabels.map((match) => match[1])).size).toBe(3);
	const selectIds = [...html.matchAll(/<select[^>]* id="([^"]+)"[^>]*>/g)].map(
		(match) => match[1],
	);
	expect(selectIds).toEqual(renderedLabels.map((match) => match[1]));
	expect(html).not.toContain("<label><select");
});
