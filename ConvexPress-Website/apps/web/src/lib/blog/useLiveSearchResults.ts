import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@convexpress-website/backend/generated/api";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";
import type { PublicAccessLease } from "@/templates/sdk/block-data/portable/publicDocumentContracts";
import { subscribeSearchDisplay, type SearchDisplay } from "./search-expiry";
type Args = FunctionArgs<typeof api.search.queries.search>;
type Result = FunctionReturnType<typeof api.search.queries.search> & {
	displayLease?: PublicAccessLease | null;
};
/** Keep the anonymous SSR tree through hydration. Leased seeds are replaced by
 * a fresh request; route/auth/transport changes cannot reuse a previous value. */
export function useLiveSearchResults(
	args: Args | null,
	seed: Result | undefined,
): Result | undefined {
	const convex = useConvex(),
		auth = useAuth(),
		convexAuth = useConvexAuth();
	const argsKey = JSON.stringify(args),
		instance = getSiteRuntime().instanceKey;
	const generation = useMemo(
		() => crypto.randomUUID(),
		[
			convex,
			argsKey,
			instance,
			Boolean(auth.isSignedIn),
			auth.userId,
			auth.sessionId,
		],
	);
	const firstGeneration = useRef(generation),
		consumedSeed = useRef(false);
	const [mounted, setMounted] = useState(false),
		[refresh, setRefresh] = useState(0);
	const [state, setState] = useState<{
		generation: string;
		display: SearchDisplay<Result>;
	} | null>(null);
	useEffect(() => setMounted(true), []);
	// An older environment keeps its existing transport; new args are sent only
	// when its response advertises the expiry contract.
	const supportsLease = Boolean(seed && Object.hasOwn(seed, "displayLease"));
	const enabled =
		mounted &&
		supportsLease &&
		args !== null &&
		auth.isLoaded &&
		!convexAuth.isLoading &&
		Boolean(auth.isSignedIn) === convexAuth.isAuthenticated;
	useEffect(() => {
		if (!enabled || !args) {
			setState(null);
			return;
		}
		const request = { ...args, refreshKey: crypto.randomUUID() };
		const watch = convex.watchQuery(api.search.queries.search, request);
		return subscribeSearchDisplay<Result>(
			watch,
			(display) => {
				consumedSeed.current = true;
				setState({ generation, display });
			},
			{
				viewerSubject: auth.isSignedIn ? (auth.userId ?? null) : null,
				onExpired: () => setRefresh((value) => value + 1),
			},
		);
	}, [convex, generation, enabled, refresh]);
	if (!supportsLease) return seed;
	if (state?.generation === generation && enabled) {
		if ("error" in state.display)
			throw Error("Search is temporarily unavailable. Please try again.");
		if ("value" in state.display) return state.display.value;
		return undefined;
	}
	if (!mounted) return seed;
	if (
		!auth.isSignedIn &&
		firstGeneration.current === generation &&
		!consumedSeed.current &&
		!seed?.displayLease
	)
		return seed;
	return undefined;
}
