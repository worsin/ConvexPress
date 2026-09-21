import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server";
import type { EventView } from "./types";
// Typed public DTO boundary; keeps private event records out of Website callers.
export const upcomingEvents = makeFunctionReference<"query", { paginationOpts: PaginationOptions; startsAtOrAfter: number }, PaginationResult<EventView>>("extensions/events/queries:upcoming");
export const eventBySlug = makeFunctionReference<"query", { slug: string }, EventView | null>("extensions/events/queries:getBySlug");
