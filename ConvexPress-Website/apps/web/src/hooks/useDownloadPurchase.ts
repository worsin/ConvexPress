import { useLiveConnection } from "./useLiveConnection";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { useAuth } from "../lib/auth/clerk";
import { getSiteRuntime } from "../lib/site-runtime";

type Attempt = { secret: string; requestId: string; expiresAt?: number; busy: boolean };
const beginLease = makeFunctionReference<"mutation", { token: string; secret: string; requestId: string }, { leaseId: string; fileName: string; fileSize: number; expiresAt: number }>("commerceDigital/delivery:beginLease");

/** Keeps uncertain initiation retries bound to the same request/secret. Neither
 * authorization data nor download capabilities are saved in page content. */
export function useDownloadPurchase() {
  const begin = useMutation(beginLease);
  const { userId, sessionId } = useAuth();
  const auth = useConvexAuth(), connection = useLiveConnection();
  const runtime = getSiteRuntime();
  const scope = JSON.stringify([runtime.convexUrl, runtime.instanceKey, userId, sessionId, auth.isLoading, auth.isAuthenticated]);
  const lifetime = useRef({ scope, generation: 0, active: false });
  if (lifetime.current.scope !== scope) {
    lifetime.current.scope = scope;
    lifetime.current.generation++;
  }
  const attempts = useRef(new Map<string, Attempt>());
  const [busyTokens, setBusyTokens] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    lifetime.current.active = true;
    attempts.current.clear();
    setBusyTokens(new Set());
    return () => {
      lifetime.current.active = false;
      lifetime.current.generation++;
      attempts.current.clear();
    };
  }, [scope]);

  async function download(token: string): Promise<void> {
    if (!lifetime.current.active || lifetime.current.scope !== scope || auth.isLoading || !auth.isAuthenticated || !connection.isWebSocketConnected) throw Error("Reconnect before starting a download.");
    let attempt = attempts.current.get(token);
    if (attempt?.busy) return;
    if (!attempt || (attempt.expiresAt !== undefined && attempt.expiresAt <= Date.now())) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      attempt = { secret: Array.from(bytes, value => value.toString(16).padStart(2, "0")).join(""), requestId: crypto.randomUUID(), busy: false };
      attempts.current.set(token, attempt);
    }
    const generation = lifetime.current.generation;
    // Scope equality alone misses switching away and back. A late response must
    // belong to this mounted host and this exact authority generation.
    const isCurrent = () => lifetime.current.active && lifetime.current.scope === scope && lifetime.current.generation === generation;
    const assertCurrent = () => { if (!isCurrent()) throw Error("Your account or site changed, or this page closed. Start the download again."); };
    attempt.busy = true;
    setBusyTokens(previous => new Set([...previous, token]));
    try {
      const lease = await begin({ token, secret: attempt.secret, requestId: attempt.requestId });
      assertCurrent();
      attempt.expiresAt = lease.expiresAt;
      const path = `/api/downloads/${encodeURIComponent(lease.leaseId)}`;
      const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret: attempt.secret }) });
      if (response.status !== 204) {
        if (response.status === 403 && isCurrent()) attempts.current.delete(token);
        throw Error("The download could not start. Please try again.");
      }
      assertCurrent();
      const link = document.createElement("a");
      link.href = path;
      link.download = lease.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      attempts.current.delete(token);
    } catch (error) {
      if (error instanceof ConvexError && error.data && typeof error.data === "object" && "code" in error.data) {
        if (error.data.code === "DOWNLOAD_UNAVAILABLE" && isCurrent()) attempts.current.delete(token);
        throw Error("This download is currently unavailable. Refresh your purchases and try again.");
      }
      throw error;
    } finally {
      attempt.busy = false;
      if (isCurrent()) setBusyTokens(previous => { const next = new Set(previous); next.delete(token); return next; });
    }
  }
  return { download, busyTokens };
}
