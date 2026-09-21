import {useMemo} from "react";
import {useQueries} from "convex/react";
import {api} from "@backend/convex/_generated/api";
import type {Id} from "@backend/convex/_generated/dataModel";

/** Keep the observer across renders, but a remounted retry must request a fresh
 * server evaluation instead of replaying the same cached transient error. */
export function useCanonicalDocumentQuery(postId: Id<"posts">): unknown {
	const queries = useMemo(() => ({document:{query:api.canonicalDocuments.get,args:{postId,refreshKey:crypto.randomUUID()}}}),[postId]);
	return useQueries(queries).document;
}
