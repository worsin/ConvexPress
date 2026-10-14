import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, ErrorComponent } from "@tanstack/react-router";
import { helpSearchParams } from "@/lib/help-search-params";
import { api } from "@convexpress-website/backend/generated/api";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, siteTitled } from "@/lib/seo/head";
import CoreHelpSearch, {
  type HelpSearchSurfaceData,
  type KbSearchResult,
} from "@/templates/packs/core/surfaces/help.search";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/help/search")({
  validateSearch: helpSearchParams,
  component: KbSearchResults,
  errorComponent: ErrorComponent,
  loaderDeps: ({ search }) => ({ q: search.q, category: search.category, cursor: search.cursor }),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );

    if (!isPublicPluginEnabled("kb", publicSettings)) {
      return;
    }

    if (deps.q?.trim()) {
      await queryClient.ensureQueryData(
        convexQuery(api.kb.search.searchPage, {
          query: deps.q.trim(),
          categorySlug: deps.category,
          paginationOpts: {numItems:20,cursor:deps.cursor??null},
        }),
      );
    }
  },
  head: () => buildSeoHead({
    title: siteTitled("Search - Help Center"),
    robots: "noindex, follow",
  }),
});

type SearchData = { page: KbSearchResult[]; isDone:boolean; continueCursor:string };
const EMPTY_SEARCH: SearchData = { page: [], isDone: true, continueCursor: "" };

function KbSearchResults() {
  const { q } = Route.useSearch();
  const query = q?.trim();
  return query ? <KbSearchWithQuery query={query} /> : <KbSearchView data={EMPTY_SEARCH} hasQuery={false} />;
}

function KbSearchWithQuery({ query }: { query: string }) {
  const { category, cursor } = Route.useSearch();
  const { data } = useSuspenseQuery(
    convexQuery(api.kb.search.searchPage, {
      query,
      categorySlug: category,
      paginationOpts: {numItems:20,cursor:cursor??null},
    }),
  );
  return <KbSearchView data={data} hasQuery />;
}

function KbSearchView({ data, hasQuery }: { data: SearchData; hasQuery: boolean }) {
  const { q, category, cursor } = Route.useSearch();
  const navigate = useNavigate();

  function search(query: string) {
    navigate({
      to: "/help/search",
      search: { q: query.trim() || undefined, category },
    });
  }

  const surfaceData: HelpSearchSurfaceData = {
    q,
    hasQuery,
    results: data.page,
    total: data.page.length,
    hasMore: !data.isDone,
    actions: { search },
  };

  const pageHref=(next:string|null,filtered=true)=>{
    const params=new URLSearchParams();if(q?.trim())params.set("q",q.trim());if(category&&filtered)params.set("category",category);if(next)params.set("cursor",next);return "/help/search?"+params.toString();
  };
  return <>
    <Surface name="help.search" data={surfaceData} fallback={CoreHelpSearch} />
    {hasQuery&&(cursor||category||!data.isDone)&&<nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-6 px-4 pb-12 text-sm" aria-label="Help search pages">
      {category&&<a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={pageHref(null,false)}>Search all help articles</a>}
      {cursor&&<a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={pageHref(null)}>Back to first results</a>}
      {!data.isDone&&<a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href={pageHref(data.continueCursor)}>More results →</a>}
    </nav>}
  </>;
}
