import { useConvex, useConvexAuth } from "convex/react";
import { usePublicViewer } from "../lib/auth/usePublicViewer";
import { getSiteRuntime } from "../lib/site-runtime";
import { productHistoryScope } from "../lib/commerce/product-history";
import { useStoredProductHistory, useRecordStoredProductView } from "./product-history-state";
/** Wait for the same authenticated Convex identity that owns storefront reads. */
function useHistoryScope() {
  const client = useConvex(), auth = usePublicViewer(), convexAuth = useConvexAuth();
  return productHistoryScope({backendUrl:client.url,instanceKey:getSiteRuntime().instanceKey ?? "",
    viewerKind:auth.kind,loaded:auth.isLoaded && !auth.unavailable,signedIn:Boolean(auth.isSignedIn),userId:auth.userId,
    backendLoading:convexAuth.isLoading,backendAuthenticated:convexAuth.isAuthenticated});
}
/** SSR never reads storage. A changed account/site immediately masks old state. */
export function useProductHistory(enabled = true) {
  return useStoredProductHistory(useHistoryScope(),enabled);
}
/** Call only from the actual, successfully loaded product detail view. */
export function useRecordProductView(productId: string | null) {
  useRecordStoredProductView(useHistoryScope(),productId);
}
