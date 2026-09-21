import { expect, test } from "bun:test";
import {
	summarizeUsage,
	usageLabel,
	usageProgressLabel,
	type UsageDocument,
} from "./usage";
const row = (id: string, names: string[], updatedAt = 1): UsageDocument => ({
	_id: id,
	title: id,
	slug: id,
	type: "post",
	status: "draft",
	updatedAt,
	blockNames: names,
});
test("reactive page merging counts each document once and replaces changed usage without accumulating stale counts", () => {
	const first = row("a", ["paragraph", "paragraph", "group"]);
	const second = row("b", ["paragraph"], 2);
	const merged = summarizeUsage([first, second, first]);
	expect(merged.documents).toHaveLength(2);
	expect(merged.counts.get("paragraph")).toBe(2);
	expect(merged.counts.get("group")).toBe(1);
	const refreshed = summarizeUsage([first, second, row("a", ["image"], 3)]);
	expect(refreshed.counts.get("paragraph")).toBe(1);
	expect(refreshed.counts.has("group")).toBe(false);
	expect(refreshed.counts.get("image")).toBe(1);
	expect(refreshed.documents[0]._id).toBe("a");
	expect(summarizeUsage([]).counts.size).toBe(0);
});
test("loading and partial zeros cannot be mistaken for complete totals", () => {
	expect(usageLabel(0, "LoadingFirstPage")).toContain("Checking");
	expect(usageLabel(0, "CanLoadMore")).toContain("partial");
	expect(usageLabel(3, "LoadingMore")).toContain("at least 3");
	expect(usageLabel(0, "Exhausted")).toBe("Used on 0 documents.");
	expect(usageProgressLabel(20, "CanLoadMore")).toContain("Load more");
	expect(usageProgressLabel(20, "LoadingMore")).toContain("Loading more");
	expect(usageProgressLabel(63, "Exhausted")).toContain("scan complete");
});
