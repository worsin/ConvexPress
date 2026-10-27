import { redirect } from "@tanstack/react-router";

interface Identified {
  _id?: unknown;
}

/**
 * The static front page is served at "/". Its own /page address sends
 * visitors there, keeping the query string (Customizer previews, campaign
 * tags), so the page has one address and one canonical URL. Any other page,
 * or a site whose homepage shows the latest posts, is left alone.
 */
export function redirectFrontPageHome(page: Identified | null, frontPage: Identified | null, search: Record<string, unknown>): void {
  if (page?._id && frontPage?._id === page._id) throw redirect({ to: "/", search, replace: true });
}
