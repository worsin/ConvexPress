import { useEffect, useState } from "react";
import { PRODUCT_HISTORY_MAX_AGE, readProductHistory, recordProductVisit } from "../lib/commerce/product-history";
export const PRODUCT_HISTORY_CHANGED = "convexpress:product-history-changed";
/** Storage lifecycle shared by the authenticated storefront adapter. */
export function useStoredProductHistory(scope: string | null, enabled = true) {
  const key = enabled ? scope : null;
  const [state,setState] = useState<{key:string|null;ids:string[];ready:boolean}>({key:null,ids:[],ready:false});
  useEffect(()=>{
    if (!key) { setState(previous=>previous.key===null ? previous : {key:null,ids:[],ready:false}); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh=()=>{
      clearTimeout(timer);
      let visits: ReturnType<typeof readProductHistory> = [];
      try { visits=readProductHistory(window.localStorage,key); } catch { /* Storage can be denied by browser policy. */ }
      const ids=visits.map(row=>row.id);
      setState(previous=>previous.key===key && previous.ready && JSON.stringify(previous.ids)===JSON.stringify(ids)?previous:{key,ids,ready:true});
      if (visits.length) {
        const expiresAt=Math.min(...visits.map(row=>row.viewedAt))+PRODUCT_HISTORY_MAX_AGE+1;
        timer=setTimeout(refresh,Math.max(1,Math.min(2_147_483_647,expiresAt-Date.now())));
      }
    };
    const changed=(event:Event)=>{
      if (event.type === "storage" && (event as StorageEvent).key !== null && (event as StorageEvent).key !== key) return;
      if (event.type === PRODUCT_HISTORY_CHANGED && (event as CustomEvent).detail !== key) return;
      refresh();
    };
    refresh();window.addEventListener("storage",changed);window.addEventListener(PRODUCT_HISTORY_CHANGED,changed);window.addEventListener("focus",refresh);
    return()=>{clearTimeout(timer);window.removeEventListener("storage",changed);window.removeEventListener(PRODUCT_HISTORY_CHANGED,changed);window.removeEventListener("focus",refresh);};
  },[key]);
  return {ids:key && state.key===key?state.ids:[],ready:!enabled || Boolean(key && state.key===key && state.ready)};
}
export function useRecordStoredProductView(key:string|null,productId:string|null) {
  useEffect(()=>{
    if(!key || !productId)return;
    try { if(recordProductVisit(window.localStorage,key,productId)) window.dispatchEvent(new window.CustomEvent(PRODUCT_HISTORY_CHANGED,{detail:key})); } catch { /* History is optional; browsing must still work without storage. */ }
  },[key,productId]);
}
