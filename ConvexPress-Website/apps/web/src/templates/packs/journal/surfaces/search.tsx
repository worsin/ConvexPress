/**
 * Journal · search — a centred column: display headline, one underline
 * search line with live suggestions, content-type filters as text links with
 * a sort select on the right, and results as rule-separated rows. Same URL
 * contract as Core (`/search?q=&type=&sort=&page=`), same result links, same
 * click tracking.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { Search } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import type { SearchResult } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import type { SearchSurfaceData } from "@/templates/packs/core/surfaces/search";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Container, EmptyState, Eyebrow, Pagination, SkeletonBlock, SkeletonText, SmallCaps, UnderlineInput, formatDate } from "../parts";
import { UnderlineSelect } from "../parts/extra-commerce";

const CONTENT_TYPES = [
  { value: undefined, label: "All" },
  { value: "post", label: "Posts" },
  { value: "page", label: "Pages" },
  { value: "course", label: "Courses" },
  { value: "media", label: "Media" },
] as const;

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "title", label: "Title" },
] as const;

const TYPE_LABELS: Record<string, string> = { post: "Post", page: "Page", media: "Media", comment: "Comment", course: "Course", product: "Product" };

export default function JournalSearch({ data }: SurfaceProps<SearchSurfaceData>) {
  const { query, hasQuery, type, sort, results, total, pagination, onResultClick } = data;
  const navigate = useNavigate();

  const setType = (next: string | undefined) => void navigate({ to: "/search", search: { q: query, type: next, page: 1 } } as any);
  const setSort = (next: string) => void navigate({ to: "/search", search: { q: query, type, sort: next, page: 1 } } as any);

  return (
    <Container data-slot="search-page" className="py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 md:gap-14">
        <header className="flex flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <Eyebrow>Search</Eyebrow>
            <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">
              {hasQuery ? (
                <>
                  Results for <span className="text-primary">“{query}”</span>
                </>
              ) : (
                "Search"
              )}
            </h1>
          </div>
          <SearchLine initialQuery={query ?? ""} autoFocus={!hasQuery} />
        </header>

        {hasQuery ? (
          <div className="flex flex-col gap-8">
            <div data-slot="search-filters" className="flex flex-col gap-4 border-y border-border py-4 md:flex-row md:items-center md:justify-between">
              <ul className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Content type">
                {CONTENT_TYPES.map((option) => {
                  const active = (type ?? undefined) === option.value;
                  return (
                    <li key={option.label}>
                      <button
                        type="button"
                        onClick={() => setType(option.value)}
                        aria-pressed={active}
                        className={cn("text-sm tracking-wide transition-colors", active ? "text-foreground underline decoration-foreground underline-offset-[6px]" : "text-muted-foreground hover:text-foreground")}
                      >
                        {option.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <label className="inline-flex shrink-0 items-center gap-2 self-start md:self-auto">
                <SmallCaps>Sort</SmallCaps>
                <UnderlineSelect value={sort ?? "relevance"} onChange={(event) => setSort(event.target.value)} aria-label="Sort results" className="h-9 text-sm">
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </UnderlineSelect>
              </label>
            </div>

            {results !== undefined && total > 0 ? (
              <SmallCaps as="p" className="tabular-nums">
                {total} {total === 1 ? "result" : "results"}
              </SmallCaps>
            ) : null}

            {results === undefined ? (
              <div className="flex flex-col divide-y divide-border border-y border-border" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex flex-col gap-3 py-6">
                    <SkeletonBlock className="h-3 w-32 rounded-full" />
                    <SkeletonBlock className="h-7 w-3/4" />
                    <SkeletonText lines={2} />
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                eyebrow="No results"
                title={`Nothing matched “${query}”.`}
                action={<p className="max-w-[40ch] text-sm leading-6 text-muted-foreground">Check the spelling, try more general keywords, or use fewer words.</p>}
              />
            ) : (
              <>
                <ol className="flex flex-col divide-y divide-border border-y border-border" aria-label="Search results">
                  {results.map((result, index) => (
                    <ResultRow key={result._id} result={result} onClick={() => onResultClick(result.contentType, result._id, index + 1)} />
                  ))}
                </ol>
                {pagination ? <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} getLink={(page) => ({ to: "/search", search: { q: query ?? "", ...(type ? { type } : {}), ...(sort ? { sort } : {}), ...(page > 1 ? { page } : {}) } })} /> : null}
              </>
            )}
          </div>
        ) : (
          <p className="text-center text-base leading-8 text-muted-foreground md:text-[17px]">Enter a search term to find posts, pages, and more.</p>
        )}
      </div>
    </Container>
  );
}

/* ───────────────────────── search line ───────────────────────── */

function SearchLine({ initialQuery, autoFocus }: { initialQuery: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const navigate = useNavigate();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setSuggestionsVisible(false);
    void navigate({ to: "/search", search: { q: trimmed } } as any);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setSuggestionsVisible(event.target.value.trim().length >= 2);
  }

  return (
    <form data-slot="search-form" onSubmit={onSubmit} role="search" aria-label="Search posts" className="flex w-full max-w-xl items-end gap-4 text-left">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-0 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <UnderlineInput
          type="search"
          placeholder="Search posts and pages…"
          value={query}
          onChange={onChange}
          onFocus={() => {
            if (query.trim().length >= 2) setSuggestionsVisible(true);
          }}
          onBlur={() => {
            setTimeout(() => setSuggestionsVisible(false), 200);
          }}
          className="pl-7 text-lg"
          autoFocus={autoFocus}
          aria-label="Search query"
          aria-autocomplete="list"
          role="combobox"
          aria-expanded={suggestionsVisible}
        />
        <SearchSuggestions
          query={query}
          isVisible={suggestionsVisible}
          onClose={() => setSuggestionsVisible(false)}
          onSelect={(text) => {
            setQuery(text);
            setSuggestionsVisible(false);
          }}
          className="rounded-xl shadow-sm"
        />
      </div>
      <button type="submit" className="h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
        Search
      </button>
    </form>
  );
}

/* ───────────────────────── result row ───────────────────────── */

function getResultUrl(result: SearchResult): string {
  if (result.url) return result.url;
  switch (result.contentType) {
    case "post":
      return `/blog/${result.slug}`;
    case "page":
      return `/${result.slug}`;
    case "media":
      return `/media/${result.slug}`;
    case "course":
      return `/courses/${result.slug}`;
    case "product":
      return `/products/${result.slug}`;
    case "comment":
      return result.slug ? `/blog/${result.slug}#comments` : "#";
    default:
      return `/${result.slug}`;
  }
}

function ResultRow({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const typeLabel = TYPE_LABELS[result.contentType] ?? result.contentType;
  const date = formatDate(result.publishedAt);
  const badges = [...(result.categoryNames ?? []).map((name) => ({ key: `cat:${name}`, name })), ...(result.tagNames ?? []).map((name) => ({ key: `tag:${name}`, name }))];
  return (
    <li>
      <article data-slot="search-result-card" className="flex flex-col gap-3 py-6">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SmallCaps className="text-primary">{typeLabel}</SmallCaps>
          {result.mimeType ? (
            <>
              <Dot />
              <SmallCaps className="normal-case tracking-normal">{result.mimeType}</SmallCaps>
            </>
          ) : null}
          {date ? (
            <>
              <Dot />
              <SmallCaps as="time" {...({ dateTime: result.publishedAt } as object)}>
                {date}
              </SmallCaps>
            </>
          ) : null}
          {result.author ? (
            <>
              <Dot />
              <Link to="/author/$slug" params={{ slug: result.author.slug }} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                {result.author.displayName}
              </Link>
            </>
          ) : null}
          {result.primaryCategory ? (
            <>
              <Dot />
              <Link to="/category/$slug" params={{ slug: result.primaryCategory.slug }} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                {result.primaryCategory.name}
              </Link>
            </>
          ) : null}
        </p>
        <h2 className="font-display text-2xl leading-snug tracking-tight text-foreground text-balance md:text-[1.75rem]">
          <Link to={getResultUrl(result) as any} onClick={onClick} className="transition-colors hover:text-primary">
            {result.title}
          </Link>
        </h2>
        {result.highlightedExcerpt ? (
          <p
            className="line-clamp-2 text-base leading-7 text-muted-foreground [&_mark]:bg-primary/15 [&_mark]:text-foreground"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.highlightedExcerpt, { ALLOWED_TAGS: ["mark", "em", "strong", "b", "i"], ALLOWED_ATTR: [] }) }}
          />
        ) : result.excerpt ? (
          <p className="line-clamp-2 text-base leading-7 text-muted-foreground">{result.excerpt}</p>
        ) : null}
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <Badge key={badge.key} className="normal-case tracking-normal">
                {badge.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </article>
    </li>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
  );
}
