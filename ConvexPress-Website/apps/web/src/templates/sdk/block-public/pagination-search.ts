import {SEARCH_QUERY_REQUEST_KEY,searchQuerySchema} from "../block-data/portable/searchContracts";
import { blockPageRequestSchema, parseBlockPageSearch, type BlockPageRequest } from "../block-data/portable/postGridContracts";

/** TanStack may already decode JSON-valued search fields. Both representations
 * cross the same closed request validator before entering a loader or query. */
export function canonicalPaginationSearch(search: Record<string, unknown>): { blockPages?: BlockPageRequest } {
  const value = search.blockPages;
  const request = typeof value === "string" || value == null
    ? parseBlockPageSearch(value)
    : blockPageRequestSchema.parse(value);
  // q is the shared URL search term; per-block cursors remain independent.
  const query=searchQuerySchema.parse(typeof search.q === "number" || typeof search.q === "boolean" ? String(search.q) : search.q ?? "");
  if(query)request[SEARCH_QUERY_REQUEST_KEY]=query;
  else delete request[SEARCH_QUERY_REQUEST_KEY];
  return Object.keys(request).length ? { blockPages: request } : {};
}
