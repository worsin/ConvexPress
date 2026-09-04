/**
 * Records a 404 hit for the admin's not-found report. Fire-and-forget, once
 * per mount; template packs call this from their in-layout 404 surface so
 * every pack keeps the report fed.
 */

import { useLocation } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { useEffect, useRef } from "react";

export function useLogNotFound(enabled = true) {
  const location = useLocation();
  const logNotFound = useMutation(api.routing.mutations.logNotFound);
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!enabled || hasLogged.current) return;
    hasLogged.current = true;
    const url = location.pathname + (location.search ? `?${location.search}` : "");
    logNotFound({
      url,
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent || undefined : undefined,
    }).catch(() => {
      // Fire-and-forget: logging failures never surface to the visitor.
    });
  }, [enabled, location.pathname, location.search, logNotFound]);
}
