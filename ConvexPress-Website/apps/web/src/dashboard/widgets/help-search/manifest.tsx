/**
 * Help search: knowledge-base search inline (kb.search.search), top results,
 * and a link to the dashboard help page for the full list.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { Input } from "@/components/ui/input";
import { useSettings } from "@/contexts/SettingsContext";
import { useDebounce } from "@/hooks/useDebounce";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

interface KbArticle {
  _id: string;
  title: string;
  slug: string;
  categorySlug?: string;
  categoryName?: string;
}

function HelpSearchWidget({ size, editing }: DashboardWidgetProps) {
  const settings = useSettings();
  const enabled = settings?.plugins?.knowledgeBaseEnabled === true || settings?.plugins?.kbEnabled === true;
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 300);
  const active = enabled && debounced.length >= 2;
  const results = useQuery(api.kb.search.search, active ? { query: debounced, limit: 8 } : "skip") as
    | { results: KbArticle[]; total: number }
    | undefined;
  if (!enabled) return <WidgetEmpty icon="book-open" title="Help center is off" />;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help articles…"
          aria-label="Search help articles"
          disabled={editing}
          className="h-8 pl-8 text-xs"
        />
      </div>
      {!active ? (
        <p className="text-[11px] text-muted-foreground">Type at least two characters to search.</p>
      ) : results === undefined ? (
        <WidgetSkeleton rows={3} />
      ) : results.results.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No articles match “{debounced}”.</p>
      ) : (
        <ul role="list" className="divide-y divide-border">
          {results.results.slice(0, rowsForSize(size, 4)).map((article) => (
            <li key={article._id}>
              <Link
                to="/help/$categorySlug/$articleSlug"
                params={{ categorySlug: article.categorySlug ?? "uncategorized", articleSlug: article.slug }}
                className="block py-1.5 text-xs text-foreground hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block truncate">{article.title}</span>
                {article.categoryName && <span className="block text-[10px] text-muted-foreground">{article.categoryName}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/help")}>Help center</ViewAllLink>;
}

const module: DashboardWidgetModule = {
  id: "help-search",
  Widget: HelpSearchWidget,
  Actions,
};

export default module;
