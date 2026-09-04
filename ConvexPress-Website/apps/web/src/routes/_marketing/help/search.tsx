import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, ErrorComponent } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import CoreHelpSearch, {
  type HelpSearchSurfaceData,
  type KbSearchResult,
} from "@/templates/packs/core/surfaces/help.search";
import { Surface } from "@/templates/sdk/Surface";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_marketing/help/search")({
  validateSearch: searchSchema,
  component: KbSearchResults,
  errorComponent: ErrorComponent,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("kb", publicSettings)) {
      return;
    }

    if (deps.q?.trim()) {
      await queryClient.ensureQueryData(
        convexQuery(api.kb.search.search, {
          query: deps.q.trim(),
          limit: 20,
        }),
      );
    }
  },
  head: () => buildSeoHead({
    title: siteTitled("Search - Help Center"),
    robots: "noindex, follow",
  }),
});

type SearchData = { results: KbSearchResult[]; total: number };

function KbSearchResults() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();

  const hasQuery = Boolean(q?.trim());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Convex query type mismatch with useSuspenseQuery; fix by regenerating website types
  const { data } = useSuspenseQuery(
    hasQuery
      ? (convexQuery(api.kb.search.search, {
          query: q!.trim(),
          limit: 20,
        }) as any)
      : { queryKey: ["kb-search-empty"], queryFn: () => ({ results: [], total: 0 }) },
  ) as { data: SearchData };

  function search(query: string) {
    navigate({
      to: "/help/search",
      search: { q: query.trim() || undefined },
    } as any);
  }

  const surfaceData: HelpSearchSurfaceData = {
    q,
    hasQuery,
    results: data?.results ?? [],
    total: data?.total ?? 0,
    actions: { search },
  };

  return <Surface name="help.search" data={surfaceData} fallback={CoreHelpSearch} />;
}
