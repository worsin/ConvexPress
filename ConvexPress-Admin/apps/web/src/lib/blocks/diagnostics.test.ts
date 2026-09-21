import { expect, test } from "bun:test";
import {
	diagnosticUsageStatus,
	insertionReasons,
	diagnosisLabel,
	type DiagnosticDocument,
} from "./diagnostics";
import { usageLabel, usageProgressLabel } from "./usage";
test("exhausted pages with corrupt trees cannot become complete usage totals", () => {
	const bad = { diagnosis: { usageComplete: false } } as DiagnosticDocument;
	expect(diagnosticUsageStatus("Exhausted", [bad])).toBe("Incomplete");
	expect(diagnosticUsageStatus("CanLoadMore", [bad])).toBe("CanLoadMore");
	expect(usageLabel(0, "Incomplete")).toContain("partial");
	expect(usageProgressLabel(9, "Incomplete")).toContain("need repair");
	expect(diagnosisLabel("legacy")).toContain("migration review");
});
test("availability explains template hiding, plugins, capabilities, policy and index readiness independently", () => {
	const required = { plugins: ["commerce"], capabilities: ["price.reader"] },
		ready = {
			presentation: { packId: "core", revision: "one" },
			policy: {
				enabledPlugins: [],
				capabilities: [],
				disabledBlocks: ["core/synced"],
			},
		};
	expect(insertionReasons("core/synced", true, required, undefined)).toEqual([
		"Checking site availability",
	]);
	expect(
		insertionReasons("core/synced", true, required, ready, "stale"),
	).toEqual([
		"Hidden by this template",
		"Enable commerce",
		"Required site capability unavailable",
		"Reusable content needs verification",
		"Unavailable in the current site policy",
	]);
	expect(
		insertionReasons(
			"core/heading",
			false,
			{ plugins: [], capabilities: [] },
			ready,
			"ready",
		),
	).toEqual([]);
});
