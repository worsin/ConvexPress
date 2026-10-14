/**
 * Breadcrumb titles for record pages.
 *
 * A record's URL segment is its id (`/commerce/subscriptions/contracts/<id>`),
 * which means nothing to a reader. A detail page names its record with
 * `useBreadcrumbTitle(id, "Avery Quinn")`; until it does (or on pages that
 * don't), an id segment reads "Details".
 */
import { useEffect, useSyncExternalStore } from "react";

const titles = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Name the record whose id is `segment` in the current page's breadcrumbs. */
export function useBreadcrumbTitle(segment: string | undefined, title: string | undefined): void {
  useEffect(() => {
    if (!segment || !title) return;
    titles.set(segment, title);
    changed();
    return () => {
      if (titles.get(segment) !== title) return;
      titles.delete(segment);
      changed();
    };
  }, [segment, title]);
}

/** The titles pages have registered; re-renders when one changes. */
export function useBreadcrumbTitles(): ReadonlyMap<string, string> {
  useSyncExternalStore(subscribe, () => version, () => version);
  return titles;
}

/** A Convex document id: 31–37 lowercase base32 characters, at least one digit. */
export function looksLikeRecordId(segment: string): boolean {
  return /^[0-9a-z]{31,37}$/.test(segment) && /\d/.test(segment);
}
