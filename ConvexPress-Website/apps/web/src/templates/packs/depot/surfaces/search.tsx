/**
 * Depot · search — site-wide search: a prominent search bar with live
 * suggestions, a toolbar of content-type chips and a sort select (same URL
 * params as Core's `SearchFilters`), the result count, results as card rows
 * in two columns, numbered pagination. Result clicks are tracked as in Core.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import DOMPurify from "isomorphic-dompurify";
import { FileText, GraduationCap, Image, MessageSquare, Newspaper, Search, ShoppingBag } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { SearchSuggestions } from "@/components/search/SearchSuggestions";
import type { SearchResult } from "@/lib/blog/types";
import type { SearchSurfaceData } from "@/templates/packs/core/surfaces/search";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Card, Chip, Container, EmptyState, Label, Pagination, Select, Skeleton, Toolbar, formatDate } from "../parts";
import { PageHeader } from "../parts/extra";

const CONTENT_TYPES: ReadonlyArray<{ value: string | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "post", label: "Posts" },
  { value: "page", label: "Pages" },
  { value: "course", label: "Courses" },
  { value: "media", label: "Media" },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Date" },
  { value: "title", label: "Title" },
] as const;

const TYPE_CONFIG: Record<string, { icon: typeof Newspaper; label: string }> = {
  post: { icon: Newspaper, label: "Post" },
  page: { icon: FileText, label: "Page" },
  media: { icon: Image, label: "Media" },
  comment: { icon: MessageSquare, label: "Comment" },
  course: { icon: GraduationCap, label: "Course" },
  product: { icon: ShoppingBag, label: "Product" },
};

export default function DepotSearch({ data }: SurfaceProps<SearchSurfaceData>) {
  const { query, hasQuery, type, sort, results, total, pagination, onResultClick } = data;
  const navigate = useNavigate();

  const go = (next: { type?: string; sort?: string; page?: number }) => {
    void navigate({ to: "/search", search: { q: query ?? "", type: next.type ?? type, sort: next.sort ?? sort, page: next.page ?? 1 } } as any);
  };

  return (
    <Container padded={false} data-slot="search-page" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Site search" title={hasQuery ? <>Results for <span className="text-primary">“{query}”</span></> : "Search"} meta={hasQuery && results !== undefined && total > 0 ? `${total} ${total === 1 ? "result" : "results"}` : undefined} />

      <SearchBar key={query ?? ""} initialQuery={query ?? ""} autoFocus={!hasQuery} />

      {hasQuery ? (
        <>
          <Toolbar
            label="Filters"
            end={
              <>
                <Label>Sort</Label>
                <Select value={sort ?? "relevance"} onChange={(event) => go({ sort: event.target.value })} aria-label="Sort results">
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </>
            }
          >
            <Label className="mr-1">Type</Label>
            {CONTENT_TYPES.map((entry) => (
              <Chip key={entry.label} active={(type ?? undefined) === entry.value} onClick={() => go({ type: entry.value })}>
                {entry.label}
              </Chip>
            ))}
          </Toolbar>

          {results === undefined ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title="No results found"
              description={
                <>
                  Nothing matched “{query}”. Check the spelling, try more general keywords, or use fewer words.
                </>
              }
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {results.map((result, index) => (
                  <ResultCard key={result._id} result={result} onClick={() => onResultClick(result.contentType, result._id, index + 1)} />
                ))}
              </div>
              {pagination && (
                <Pagination page={pagination.currentPage} totalPages={pagination.totalPages} linkFor={(page) => ({ to: "/search", search: { q: query ?? "", type, sort, page: page === 1 ? undefined : page } })} />
              )}
            </>
          )}
        </>
      ) : (
        <EmptyState title="Enter a search term to find posts, pages, and more." />
      )}
    </Container>
  );
}

function SearchBar({ initialQuery, autoFocus }: { initialQuery: string; autoFocus: boolean }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initialQuery);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = draft.trim();
    if (!q) return;
    setSuggestionsVisible(false);
    void navigate({ to: "/search", search: { q } } as any);
  };

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
    setSuggestionsVisible(event.target.value.trim().length >= 2);
  };

  return (
    <div className="relative">
      <form role="search" aria-label="Search the site" onSubmit={submit} className="flex" data-slot="search-form">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search query</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={draft}
            onChange={change}
            onFocus={() => {
              if (draft.trim().length >= 2) setSuggestionsVisible(true);
            }}
            onBlur={() => {
              setTimeout(() => setSuggestionsVisible(false), 200);
            }}
            placeholder="Search posts, pages, courses, products…"
            autoFocus={autoFocus}
            autoComplete="off"
            aria-autocomplete="list"
            role="combobox"
            aria-expanded={suggestionsVisible}
            className="h-10 w-full rounded-l-md border border-r-0 border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <Button type="submit" className="rounded-l-none">
          Search
        </Button>
      </form>
      <SearchSuggestions
        query={draft}
        isVisible={suggestionsVisible}
        onClose={() => setSuggestionsVisible(false)}
        onSelect={(text) => {
          setDraft(text);
          setSuggestionsVisible(false);
        }}
      />
    </div>
  );
}

function resultUrl(result: SearchResult): string {
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

function ResultCard({ result, onClick }: { result: SearchResult; onClick: () => void }) {
  const config = TYPE_CONFIG[result.contentType] ?? { icon: FileText, label: result.contentType };
  const Icon = config.icon;
  const date = formatDate(result.publishedAt);
  return (
    <Card as="article" data-slot="search-result-card" className="flex gap-3 p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Label className="text-primary">{config.label}</Label>
          {result.mimeType && <Label>{result.mimeType}</Label>}
          {date && (
            <Label as="time" dateTime={result.publishedAt}>
              {date}
            </Label>
          )}
          {result.author && (
            <Link to="/author/$slug" params={{ slug: result.author.slug }} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
              {result.author.displayName}
            </Link>
          )}
          {result.primaryCategory && (
            <Link to="/category/$slug" params={{ slug: result.primaryCategory.slug }} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
              {result.primaryCategory.name}
            </Link>
          )}
        </p>
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          <Link to={resultUrl(result)} onClick={onClick} className="line-clamp-2 hover:text-primary">
            {result.title}
          </Link>
        </h3>
        {result.highlightedExcerpt ? (
          <p
            className="line-clamp-2 text-[13px] leading-5 text-muted-foreground [&_mark]:bg-primary/20 [&_mark]:text-foreground"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.highlightedExcerpt, { ALLOWED_TAGS: ["mark", "em", "strong", "b", "i"], ALLOWED_ATTR: [] }) }}
          />
        ) : result.excerpt ? (
          <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{result.excerpt}</p>
        ) : null}
        {(result.categoryNames?.length || result.tagNames?.length) ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {result.categoryNames?.map((name) => (
              <span key={`cat:${name}`} className="rounded-md bg-muted px-1.5 text-[11px] leading-5 text-muted-foreground">
                {name}
              </span>
            ))}
            {result.tagNames?.map((name) => (
              <span key={`tag:${name}`} className="rounded-md bg-muted/60 px-1.5 text-[11px] leading-5 text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
