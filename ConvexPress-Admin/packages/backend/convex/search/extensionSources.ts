import { extensionSearchSources } from "../schema/_searchIndex.generated";
import type { QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import type { PublicSearchSource } from "./publicSource";

export interface ExtensionSearchSource {
  id: string;
  contentType: PublicSearchSource["contentType"];
  matchesId: (ctx: Pick<QueryCtx, "db">, rawId: string) => boolean;
  createReader: (ctx: QueryCtx, budget?: RequestReadLedger) => (rawId: string) => Promise<PublicSearchSource | null>;
}

/** Installed code owns the candidate's table. Never infer an extension from
 * an index URL or accept an arbitrary table/function name from a caller. */
export function createExtensionSearchSourceReader(ctx: QueryCtx, budget?: RequestReadLedger) {
  const readers = new Map<ExtensionSearchSource, ReturnType<ExtensionSearchSource["createReader"]>>();
  return async (row: Pick<PublicSearchSource, "contentType" | "contentId">): Promise<PublicSearchSource | null> => {
    const sources = extensionSearchSources.filter(source => source.contentType === row.contentType && source.matchesId(ctx, row.contentId));
    // Misconfigured duplicate table ownership cannot choose an arbitrary plugin.
    if (sources.length !== 1) return null;
    const source = sources[0];
    let read = readers.get(source);
    if (!read) { read = source.createReader(ctx, budget); readers.set(source, read); }
    return read(row.contentId);
  };
}
