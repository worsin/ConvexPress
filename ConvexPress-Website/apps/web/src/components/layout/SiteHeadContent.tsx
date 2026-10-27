import { Asset, useRouter, useRouterState, useTags } from "@tanstack/react-router";

import { notFoundTags } from "@/lib/seo/not-found-head";

/**
 * The router's head tags (what HeadContent renders), except on a page that
 * answered 404: there they say so (lib/seo/not-found-head.ts). A route's
 * head() is handed the matches as they were before loading, so no route can
 * tell from there that a child found nothing; the router's state can.
 */
export function SiteHeadContent() {
  const tags = useTags();
  const router = useRouter();
  const missing = useRouterState({
    select: (state) => state.matches.some((match) => match.status === "notFound" || match.globalNotFound === true),
  });
  const nonce = router.options.ssr?.nonce;
  return (
    <>
      {(missing ? notFoundTags(tags) : tags).map((tag) => (
        <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
      ))}
    </>
  );
}
