import { blockPageRequestSchema, type BlockPageRequest } from "../block-data/portable/postGridContracts";
import type { PublicCanonicalDocument } from "../block-data/portable/publicDocumentContracts";
import { subscribePublicDisplay, type PublicReadState, type PublicWatch } from "./subscription";
import type { PublicDisplayBinding } from "./display-state";

export function nextCatalogRequest(value: PublicCanonicalDocument, request: BlockPageRequest): BlockPageRequest | null {
  if (value?.state !== "ready") return null;
  const next = {...request}; let changed = false;
  for (const [blockId, entry] of Object.entries(value.data.dataByBlock)) {
    if (entry.resolver !== "commerce.categoryTiles" || entry.data.nextCursor === null) continue;
    if (entry.data.nextCursor === request[blockId]) throw new Error("Catalog continuation did not advance");
    next[blockId] = entry.data.nextCursor; changed = true;
  }
  return changed ? blockPageRequestSchema.parse(next) : null;
}

/** One mounted viewer generation owns the entire continuation chain. Each chunk
 * goes through the same exact-request validation and authorization lease clock.
 * Completion keeps its last subscription alive so revision changes restart it. */
export function subscribeCatalogDisplay(
  watch: (request: BlockPageRequest) => PublicWatch,
  binding: PublicDisplayBinding,
  notify: (state: PublicReadState) => void,
  onExpired: () => void,
) {
  let active = true, stop: (()=>void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = (request: BlockPageRequest) => {
    stop?.();
    stop = subscribePublicDisplay(watch(request), {...binding,request}, state => {
      if (!active) return;
      if (timer !== undefined) { clearTimeout(timer); timer=undefined; }
      notify(state);
      if ("error" in state) return;
      const next = nextCatalogRequest(state.value,request);
      // Defer to avoid replacing a subscription inside its synchronous initial
      // callback. Cleanup and newer updates cancel this exact queued chunk.
      if (next) timer=setTimeout(()=>{timer=undefined;if(active)read(next);},0);
    }, {onExpired});
  };
  read(binding.request ?? {});
  return () => { active=false; if(timer!==undefined)clearTimeout(timer);stop?.(); };
}
