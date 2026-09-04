/**
 * Help center inside the dashboard: inline knowledge-base search with a link
 * out to the full help center. Uses the same public search query the
 * /help/search route uses, so results and article URLs stay identical.
 */

import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/useDebounce";

interface KbArticle {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  categorySlug?: string;
  categoryName?: string;
  readingTimeMinutes?: number;
}

export function HelpPage() {
  return (
    <PublicPluginGate pluginId="kb">
      <HelpContent />
    </PublicPluginGate>
  );
}

function HelpContent() {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 300);
  const hasQuery = debounced.length >= 2;

  const results = useQuery(
    api.kb.search.search,
    hasQuery ? { query: debounced, limit: 20 } : "skip",
  ) as { results: KbArticle[]; total: number } | undefined;
  const featured = useQuery(api.kb.queries.getFeatured, hasQuery ? "skip" : { limit: 6 }) as
    | KbArticle[]
    | undefined;

  const onSubmit = (event: FormEvent) => event.preventDefault();

  const list = hasQuery ? results?.results : featured;
  const loading = list === undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-sm font-medium text-foreground">Help center</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Search guides and answers without leaving your dashboard.
          </p>
        </div>
        <Link
          to="/help"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open the full help center
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      <form onSubmit={onSubmit} role="search" className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search articles…"
          aria-label="Search help articles"
          className="pl-9"
          autoFocus
        />
      </form>

      <section aria-live="polite" className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {hasQuery
            ? `${results?.total ?? 0} result${results?.total === 1 ? "" : "s"} for “${debounced}”`
            : "Featured articles"}
        </h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={hasQuery ? "No articles match" : "No featured articles yet"}
            description={hasQuery ? "Try different words, or browse the help center." : "Search above to find an answer."}
            action={{ label: "Browse the help center", href: "/help" }}
          />
        ) : (
          <ul role="list" className="divide-y divide-border border border-border bg-card">
            {list.map((article) => (
              <li key={article._id}>
                <Link
                  to="/help/$categorySlug/$articleSlug"
                  params={{
                    categorySlug: article.categorySlug ?? "uncategorized",
                    articleSlug: article.slug,
                  }}
                  className="block px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p className="text-sm font-medium text-foreground">{article.title}</p>
                  {article.excerpt ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{article.excerpt}</p>
                  ) : null}
                  <p className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                    {article.categoryName ? <span className="text-primary">{article.categoryName}</span> : null}
                    {article.readingTimeMinutes ? <span>{article.readingTimeMinutes} min read</span> : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
