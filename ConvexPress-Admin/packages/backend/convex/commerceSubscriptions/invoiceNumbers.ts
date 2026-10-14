/**
 * Subscription invoice numbers: sequential, unique and prefixed (`INV-000042`).
 *
 * The counter lives in the `commerce.subscriptions.counters` settings row once
 * an operator has saved that section. Without the row, the next number follows
 * the most recently allocated invoice, so a site that never configured the
 * counter still gets unique numbers. Both reads share the inserting mutation's
 * transaction: concurrent allocations conflict and retry rather than collide.
 */
import type { MutationCtx } from "../_generated/server";
import { settingsRecord } from "../helpers/settingsReader";
import { patchWithMediaReferences } from "../media/attachmentGuard";

const DEFAULT_PREFIX = "INV-";
const DIGITS = 6;
/** How many recent invoices to look through for the latest numbered one. */
const RECENT_SCAN = 25;

function parseSequence(invoiceNumber: string | undefined, prefix: string): number {
	if (!invoiceNumber?.startsWith(prefix)) return 0;
	const digits = invoiceNumber.slice(prefix.length);
	if (!/^\d+$/.test(digits)) return 0;
	return Number.parseInt(digits, 10);
}

export async function allocateSubscriptionInvoiceNumber(ctx: MutationCtx): Promise<string> {
	const counters = await ctx.db
		.query("settings")
		.withIndex("by_section", (q) => q.eq("section", "commerce.subscriptions.counters"))
		.unique();
	const values = settingsRecord(counters?.values);
	const prefix =
		typeof values.invoicePrefix === "string" && values.invoicePrefix.length > 0 ? values.invoicePrefix : DEFAULT_PREFIX;
	const stored = typeof values.invoiceCounter === "number" ? values.invoiceCounter : 0;

	const recent = await ctx.db.query("commerce_subscription_invoices").order("desc").take(RECENT_SCAN);
	const latest = recent.reduce((highest, invoice) => Math.max(highest, parseSequence(invoice.invoiceNumber, prefix)), 0);

	const next = Math.max(stored, latest) + 1;
	if (counters) {
		await patchWithMediaReferences(ctx, "settings", counters._id, {
			values: { ...values, invoiceCounter: next },
			updatedAt: Date.now(),
		});
	}
	return `${prefix}${String(next).padStart(DIGITS, "0")}`;
}
