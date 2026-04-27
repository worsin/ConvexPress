/**
 * KB Article List Table
 *
 * WordPress-style list table for KB articles with:
 *   - Status tabs (All, Draft, Review, Published, Archived)
 *   - Search bar
 *   - Sortable columns
 *   - Bulk actions
 *   - Row actions (Edit, View, Delete)
 *
 * This is a placeholder component. The Admin List Table UI Expert
 * will implement the full component using the shared list table patterns.
 */

import { usePaginatedQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_authenticated/_admin/kb/index";

export function KBArticleListTable() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const articles = usePaginatedQuery(
    api.kb.queries.list,
    {
      status: search.status as any,
      search: search.search,
      categoryId: search.categoryId as Id<"kb_categories"> | undefined,
      authorId: search.authorId as Id<"users"> | undefined,
    },
    { initialNumItems: 20 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Knowledge Base Articles</h1>
        <button
          onClick={() => navigate({ to: "/kb/new" })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add New Article
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-border">
        {(["all", "draft", "review", "published", "archived"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() =>
              navigate({
                search: { ...search, status: tab === "all" ? undefined : tab, page: 1 },
              })
            }
            className={`px-3 py-2 text-sm font-medium ${
              tab === "all"
                ? !search.status
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
                : search.status === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Article list -- placeholder for full list table implementation */}
      <div className="rounded-lg border border-border bg-card">
        {articles.status === "LoadingFirstPage" ? (
          <div className="animate-pulse space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        ) : articles.results.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No articles found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Author</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Views</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {articles.results.map((article) => (
                <tr
                  key={article._id}
                  className="border-b border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate({ to: "/kb/$articleId/edit", params: { articleId: article._id } })}
                >
                  <td className="px-4 py-3 font-medium">{article.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {article.author?.displayName ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      article.status === "published"
                        ? "bg-success/10 text-success"
                        : article.status === "draft"
                          ? "bg-warning/10 text-warning"
                          : article.status === "review"
                            ? "bg-primary/10 text-primary"
                            : "bg-foreground/5 text-muted-foreground"
                    }`}>
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{article.viewCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(article.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
