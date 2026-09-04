import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Pretty page URLs: /our-story → /page/our-story.
 *
 * The redirect happens in the loader, so it runs during SSR and the visitor's
 * first response is the real page with its own <title> and meta (a client-side
 * <Navigate/> shipped an empty shell first, which crawlers and link previews saw).
 */
export const Route = createFileRoute("/_marketing/$slug")({
  loader: ({ params }) => {
    throw redirect({ to: "/page/$", params: { _splat: params.slug }, replace: true });
  },
});
