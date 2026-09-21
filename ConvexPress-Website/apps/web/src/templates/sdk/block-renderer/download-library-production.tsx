import { useLiveConnection } from "../../../hooks/useLiveConnection";
import { Component, useEffect, useState, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useAuth } from "../../../lib/auth/clerk";
import { getSiteRuntime } from "../../../lib/site-runtime";
import { useDownloadPurchase } from "../../../hooks/useDownloadPurchase";
import { DownloadLibraryProvider, type DownloadLibraryItem, type DownloadLibraryHostProps } from "./download-library";
type Page = { page: (DownloadLibraryItem & { token: string | null })[]; isDone: boolean; continueCursor: string; expiresAt: number };
const library = makeFunctionReference<"query", { instanceKey: string; refreshKey: string; paginationOpts: { numItems: number; cursor: string | null } }, Page | null>("commerceDigital/library:page");
class LibraryBoundary extends Component<DownloadLibraryHostProps & { instanceKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.children({ state: "unavailable" }) : <LibraryPageHost instanceKey={this.props.instanceKey}>{this.props.children}</LibraryPageHost>; }
}
function LibraryPageHost({ children, instanceKey }: DownloadLibraryHostProps & { instanceKey: string }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [refreshKey, setRefreshKey] = useState("initial");
  const [message, setMessage] = useState("");
  const result = useQuery(library, { instanceKey, refreshKey, paginationOpts: { numItems: 12, cursor: cursors[cursors.length - 1]! } });
  const purchase = useDownloadPurchase(), connection = useLiveConnection();
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setRefreshKey(crypto.randomUUID()), Math.max(0, result.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [result]);
  if (!connection.isWebSocketConnected) return children({ state: "offline" });
  if (result === null) return children({ state: "unavailable" });
  if (!result || result.expiresAt <= Date.now()) return children({ state: "loading" });
  const items = result.page.map(({ token: _token, ...item }) => item);
  const busy = new Set(result.page.filter(item => item.token && purchase.busyTokens.has(item.token)).map(item => item.id));
  return children({ state: "ready", items, busy, message,
    previous: cursors.length > 1 ? () => { setCursors(values => values.slice(0, -1)); setMessage(""); } : null,
    next: !result.isDone ? () => { setCursors(values => [...values, result.continueCursor]); setMessage(""); } : null,
    download: async id => {
      const item = result.page.find(value => value.id === id);
      if (!item?.token || item.status !== "available" || result.expiresAt <= Date.now()) { setMessage("Refresh your purchases before downloading."); setRefreshKey(crypto.randomUUID()); return; }
      try { await purchase.download(item.token); setMessage(`Download requested: ${item.fileName}`); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Your download could not start. Please try again."); }
    },
  });
}
function ProductionHost({ children }: DownloadLibraryHostProps) {
  const auth = useAuth(), convexAuth = useConvexAuth(), runtime = getSiteRuntime();
  if (!auth.isLoaded || convexAuth.isLoading) return children({ state: "loading" });
  if (!auth.isSignedIn) return children({ state: "signed-out" });
  if (!convexAuth.isAuthenticated || !auth.userId || !runtime.instanceKey) return children({ state: "unavailable" });
  return <LibraryBoundary instanceKey={runtime.instanceKey} key={`${runtime.convexUrl}:${runtime.instanceKey}:${auth.userId}:${auth.sessionId}`}>{children}</LibraryBoundary>;
}
export function ProductionDownloadLibraryProvider({ children }: { children: ReactNode }) {
  return <DownloadLibraryProvider host={ProductionHost}>{children}</DownloadLibraryProvider>;
}
