import { getFunctionName, type AnyFunctionReference } from "convex/server";

import { api } from "@convexpress-website/backend/generated/api";

/**
 * A site may mount ConvexPress under a namespace of its own deployment (e.g.
 * CaseMedix's "convexpress/"). Renderer cases name backend functions as
 * ConvexPress declares them, so calls are recorded with that prefix removed.
 */
const ANCHOR = "canonicalRsvp:get";
const NAMESPACE = getFunctionName(api.canonicalRsvp.get).slice(0, -ANCHOR.length);

export function bareFunctionName(ref: AnyFunctionReference): string {
  const name = getFunctionName(ref);
  return name.startsWith(NAMESPACE) ? name.slice(NAMESPACE.length) : name;
}
