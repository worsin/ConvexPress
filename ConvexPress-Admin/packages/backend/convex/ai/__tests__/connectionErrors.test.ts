import { expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { testProviderConnection } from "../actions";
const invoke = (
	testProviderConnection as unknown as {
		_handler: (
			ctx: unknown,
			args: {},
		) => Promise<{ ok: boolean; message: string }>;
	}
)._handler;
test("connection test reads structured failure data instead of an opaque internal-action message", async () => {
	const failure = new ConvexError({
		code: "CONFIGURATION_ERROR",
		message: "private configuration detail",
	});
	failure.message = "Server Error";
	const calls: string[] = [];
	const result = await invoke(
		{
			runQuery: async () => {
				calls.push("authorize");
			},
			runAction: async () => {
				calls.push("provider");
				throw failure;
			},
		},
		{},
	);
	expect(calls).toEqual(["authorize", "provider"]);
	expect(result).toEqual({
		ok: false,
		message:
			"Configure an AI provider and API key in Settings > AI, then try again.",
	});
});
test("connection failures never expose arbitrary provider text and access denial precedes provider invocation", async () => {
	const result = await invoke(
		{
			runQuery: async () => {},
			runAction: async () => {
				throw Error("Authorization: Bearer synthetic-secret");
			},
		},
		{},
	);
	expect(result.message).toBe(
		"AI provider connection failed. Check your provider credentials and model in Settings > AI.",
	);
	let called = false;
	await expect(
		invoke(
			{
				runQuery: async () => {
					throw new ConvexError({ code: "FORBIDDEN" });
				},
				runAction: async () => {
					called = true;
				},
			},
			{},
		),
	).rejects.toThrow();
	expect(called).toBe(false);
});
