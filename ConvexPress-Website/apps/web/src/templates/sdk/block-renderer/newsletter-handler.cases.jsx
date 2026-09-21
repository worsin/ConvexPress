import { test, expect } from "bun:test";
import { getFunctionName } from "convex/server";
import { api } from "../../../../../../packages/backend/generated/api.js";
import { subscribeNewsletter } from "../../../../../../../ConvexPress-Admin/packages/backend/convex/emails/mutations";
import {
	createNewsletterTransport,
	newsletterReceiptSchema,
} from "./newsletter";

test("production newsletter handler returns the validated receipt only after actual subscriber writes and does not send confirmation email", async () => {
	expect(getFunctionName(api.emails.mutations.subscribeNewsletter)).toBe(
		"emails/mutations:subscribeNewsletter",
	);
	const rows = [];
	const calls = [];
	const ctx = {
		db: {
			query(table) {
				expect(table).toBe("newsletterSubscribers");
				let email;
				return {
					withIndex(name, fn) {
						expect(name).toBe("by_email");
						fn({
							eq(field, value) {
								expect(field).toBe("email");
								email = value;
							},
						});
						return {
							unique: async () =>
								rows.find((row) => row.email === email) ?? null,
						};
					},
				};
			},
			async insert(table, value) {
				expect(table).toBe("newsletterSubscribers");
				rows.push({ _id: "synthetic-subscriber", ...value });
				calls.push("insert");
				return "synthetic-subscriber";
			},
			async patch(table, id, value) {
				expect(table).toBe("newsletterSubscribers");
				Object.assign(
					rows.find((row) => row._id === id),
					value,
				);
				calls.push("patch");
			},
		},
		scheduler: {
			runAfter() {
				throw new Error(
					"This mutation must not pretend it sent confirmation mail",
				);
			},
		},
		runAction() {
			throw new Error("Unexpected external action");
		},
	};
	const transport = createNewsletterTransport("synthetic-site", (args) =>
		subscribeNewsletter._handler(ctx, args),
	);
	expect(
		newsletterReceiptSchema.parse(
			await transport.subscribe("  READER@example.invalid  "),
		),
	).toEqual({ ok: true, status: "subscribed" });
	expect(rows).toHaveLength(1);
	expect(rows[0].email).toBe("reader@example.invalid");
	expect(rows[0].status).toBe("subscribed");
	expect(rows[0].source).toBe("canonical_newsletter");
	expect(
		newsletterReceiptSchema.parse(
			await transport.subscribe("reader@example.invalid"),
		).status,
	).toBe("subscribed");
	expect(rows).toHaveLength(1);
	expect(calls).toEqual(["insert"]);
	rows[0].status = "unsubscribed";
	expect(
		newsletterReceiptSchema.parse(
			await transport.subscribe("reader@example.invalid"),
		).status,
	).toBe("subscribed");
	expect(rows[0].status).toBe("subscribed");
	expect(calls).toEqual(["insert", "patch"]);
	expect(
		await transport.subscribe("not-email").then(
			() => false,
			() => true,
		),
	).toBe(true);
	expect(rows).toHaveLength(1);
});
