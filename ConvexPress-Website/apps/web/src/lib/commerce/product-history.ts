/** Browser-owned history. No product content, identity tokens or server writes. */
export const PRODUCT_HISTORY_LIMIT = 48;
export const PRODUCT_HISTORY_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_STORAGE_BYTES = 20_000;
export type ProductVisit = { id: string; viewedAt: number };
export type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function productHistoryKey(scope: { backendUrl: string; instanceKey: string; viewerKey: string }): string | null {
  if (!scope.instanceKey || scope.instanceKey.length > 256 || !scope.viewerKey || scope.viewerKey.length > 512) return null;
  try {
    const url = new URL(scope.backendUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return `convexpress:product-history:v1:${JSON.stringify([url.href.replace(/\/$/u,""),scope.instanceKey,scope.viewerKey])}`;
  } catch { return null; }
}
export function parseProductHistory(raw: string | null, now = Date.now()): ProductVisit[] {
  if (!raw || raw.length > MAX_STORAGE_BYTES || !Number.isSafeInteger(now) || now < 0) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("visits" in value) || !Array.isArray(value.visits) || value.visits.length > PRODUCT_HISTORY_LIMIT) return [];
    const unique = new Map<string, ProductVisit>();
    for (const entry of value.visits) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/u.test(entry.id)
        || !Number.isSafeInteger(entry.viewedAt) || entry.viewedAt < 0 || entry.viewedAt > now + 5 * 60 * 1000 || now - entry.viewedAt > PRODUCT_HISTORY_MAX_AGE) continue;
      const previous = unique.get(entry.id);
      if (!previous || entry.viewedAt > previous.viewedAt) unique.set(entry.id, {id:entry.id,viewedAt:entry.viewedAt});
    }
    return [...unique.values()].sort((a,b)=>b.viewedAt-a.viewedAt).slice(0,PRODUCT_HISTORY_LIMIT);
  } catch { return []; }
}
export function readProductHistory(storage: Pick<Storage,"getItem">, key: string, now = Date.now()): ProductVisit[] {
  try { return parseProductHistory(storage.getItem(key), now); } catch { return []; }
}
export function recordProductVisit(storage: HistoryStorage, key: string, id: string, now = Date.now()): boolean {
  if (!/^[A-Za-z0-9_-]{1,256}$/u.test(id) || !Number.isSafeInteger(now) || now < 0) return false;
  try {
    const visits = [{id,viewedAt:now},...readProductHistory(storage,key,now).filter(row=>row.id!==id)].slice(0,PRODUCT_HISTORY_LIMIT);
    storage.setItem(key,JSON.stringify({version:1,visits})); return true;
  } catch { return false; }
}

/** An unresolved identity must never read or write the anonymous bucket. */
export function productHistoryScope(scope: {backendUrl:string;instanceKey:string;loaded:boolean;signedIn:boolean;userId?:string|null;backendLoading:boolean;backendAuthenticated:boolean}): string | null {
  if (!scope.loaded || scope.backendLoading || scope.signedIn !== scope.backendAuthenticated || (scope.signedIn && !scope.userId)) return null;
  return productHistoryKey({...scope,viewerKey:scope.signedIn ? `user:${scope.userId}` : "anonymous"});
}
