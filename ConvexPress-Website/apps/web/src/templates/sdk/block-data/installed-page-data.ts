import { z } from "zod";
import {
	scopeSchema,
	stableKey,
	type DataEnvelope,
	type ResolverPolicy,
} from "./portable/contracts";
import { validateCanonicalData } from "./portable/resolve";
import type { ComposedDataContext } from "./portable/planner";
import { blockPageRequestSchema } from "./portable/postGridContracts";

export const displayContextSchema = z
	.object({
		scope: scopeSchema,
		documentKey: z.string().min(1).max(256),
		revision: z.string().min(1).max(256),
		viewerKey: z.string().min(1).max(256),
		request: blockPageRequestSchema.optional(),
	})
	.strict();
export type PageDisplayContext = z.infer<typeof displayContextSchema>;
declare const installed: unique symbol;
/** Opaque in-memory grant, never an instance field or serializable capability. */
export interface InstalledPageData {
	readonly [installed]: true;
}
export interface PageDataInput {
	grant: InstalledPageData;
	current: PageDisplayContext;
}
const grants = new WeakMap<
	object,
	{
		subscribe: (listener: () => void) => () => void;
		version: () => number;
		read: (
			tree: unknown,
			policy: ResolverPolicy,
			current: PageDisplayContext,
      composed?: ComposedDataContext,
		) => DataEnvelope;
	}
>();
export class PageDataError extends Error {
	constructor(
		public code: string,
		message: string,
	) {
		super(message);
		this.name = "PageDataError";
	}
}

/** Shared in-memory display state, not an authentication mechanism. The native
 * preview host must decode its closed authorized document DTO before installation.
 * Demo callers use the same structural validation, but never grant backend access.
 * Neither this module nor a stored block can fetch data or acquire permissions. */
export function createContentPageDisplayStore() {
	let generation = 0;
	const listeners = new Set<() => void>();
	const invalidate = () => {
		generation++;
		for (const listener of listeners) listener();
	};
	return Object.freeze({
		invalidate,
		install({
			tree,
			policy,
			context,
			envelope,
      composed,
		}: {
			tree: unknown;
			policy: ResolverPolicy;
			context: PageDisplayContext;
			envelope: unknown;
      composed?: ComposedDataContext;
		}): InstalledPageData {
			// Replacing a viewer/tree/scope invalidates old data even if the new envelope refuses.
			invalidate();
			const issued = generation;
			const capturedContext = displayContextSchema.parse(context);
			const capturedTree = stableKey(tree);
			const capturedPolicy = stableKey(policy);
			const verified = validateCanonicalData(
				tree,
				capturedContext.scope,
				policy,
				envelope,
				capturedContext.request,
        composed,
			);
      const capturedDefinitions = composed === undefined ? undefined : structuredClone(composed);
      const definitionsKey = stableKey(capturedDefinitions ?? null);
			const grant = Object.freeze({}) as InstalledPageData;
			grants.set(grant, {
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				version: () => generation,
				read(currentTree, currentPolicy, current, currentDefinitions) {
					if (issued !== generation)
						throw new PageDataError(
							"STALE_PAGE_DATA",
							"The installed page data was invalidated. Resolve the current view again.",
						);
					if (
						stableKey(displayContextSchema.parse(current)) !==
							stableKey(capturedContext) ||
						stableKey(currentTree) !== capturedTree ||
						stableKey(currentPolicy) !== capturedPolicy ||
            stableKey(currentDefinitions ?? null) !== definitionsKey
					)
						throw new PageDataError(
							"STALE_PAGE_DATA",
							"Data does not match the current viewer, document, tree, definitions, policy or environment.",
						);
					return validateCanonicalData(
						currentTree,
						current.scope,
						currentPolicy,
						verified,
						current.request,
            capturedDefinitions,
					);
				},
			});
			return grant;
		},
	});
}
export function readInstalledPageData(
	input: PageDataInput,
	tree: unknown,
	policy: ResolverPolicy,
  composed?: ComposedDataContext,
) {
	const registered = input && grants.get(input.grant);
	if (!registered)
		throw new PageDataError(
			"MISSING_PAGE_DATA",
			"Install validated display data through its host; stored JSON cannot install it.",
		);
	return registered.read(tree, policy, input.current, composed);
}
export function pageDataSubscription(grant: InstalledPageData) {
	const registered = grants.get(grant);
	if (!registered)
		throw new PageDataError(
			"MISSING_PAGE_DATA",
			"No installed in-memory page data",
		);
	return { subscribe: registered.subscribe, getSnapshot: registered.version };
}
