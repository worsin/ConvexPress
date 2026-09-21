import type { UsageDocument, UsageLoadStatus } from "./usage";
export interface DiagnosticDocument extends UsageDocument {
	diagnosis: {
		state: "valid" | "invalid" | "legacy" | "unsupported";
		issue: {
			code: "invalid_structure" | "unsupported_format" | "usage_incomplete";
			path: string;
		} | null;
		usageComplete: boolean;
	};
}
export interface DiagnosticReadiness {
	presentation: { packId: string; revision: string };
	policy: {
		enabledPlugins: readonly string[];
		disabledBlocks: readonly string[];
		capabilities: readonly string[];
	};
}
export function diagnosticUsageStatus(
	status: UsageLoadStatus,
	documents: readonly DiagnosticDocument[],
): UsageLoadStatus {
	return status === "Exhausted" &&
		documents.some((doc) => !doc.diagnosis.usageComplete)
		? "Incomplete"
		: status;
}
export function insertionReasons(
	name: string,
	hidden: boolean,
	requires: { plugins: readonly string[]; capabilities: readonly string[] },
	readiness: DiagnosticReadiness | undefined,
	syncedStatus?: string,
) {
	if (!readiness) return ["Checking site availability"];
	const reasons: string[] = [];
	if (hidden) reasons.push("Hidden by this template");
	for (const plugin of requires.plugins)
		if (!readiness.policy.enabledPlugins.includes(plugin))
			reasons.push(`Enable ${plugin}`);
	if (
		requires.capabilities.some(
			(value) => !readiness.policy.capabilities.includes(value),
		)
	)
		reasons.push("Required site capability unavailable");
	if (name === "core/synced" && syncedStatus !== "ready")
		reasons.push(
			syncedStatus
				? "Reusable content needs verification"
				: "Checking reusable content",
		);
	if (readiness.policy.disabledBlocks.includes(name))
		reasons.push("Unavailable in the current site policy");
	return reasons;
}
export function diagnosisLabel(
	state: DiagnosticDocument["diagnosis"]["state"],
) {
	return {
		valid: "Structure valid",
		invalid: "Needs repair",
		legacy: "Legacy: migration review",
		unsupported: "Unsupported format",
	}[state];
}
