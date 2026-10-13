/**
 * Commerce Subscriptions — readers for schema-untyped JSON bags.
 *
 * `pricingSnapshot`, `sourceMetadata` and `metadata` columns are stored as
 * free-form objects. These helpers read a single field and check its runtime
 * type instead of trusting the stored shape.
 */

export type SnapshotBag = Record<string, unknown>;

export function asSnapshotBag(value: unknown): SnapshotBag {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as SnapshotBag;
	}
	return {};
}

export function snapshotNumber(value: unknown, key: string): number | undefined {
	const field = asSnapshotBag(value)[key];
	return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

export function snapshotString(value: unknown, key: string): string | undefined {
	const field = asSnapshotBag(value)[key];
	return typeof field === "string" ? field : undefined;
}
