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

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_authenticated/_admin/kb/index";

export function KBArticleListTable() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const articles = useQuery(api.kb.queries.list, {
    status: search.status as any,
    search: search.search,
    page: search.page ?? 1,
    perPage: search.perPage ?? 20,
    categoryId: search.categoryId as any,
    authorId: search.authorId as any,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Knowledge Base Articles</h1>
        <button
          onClick={() => navigate({ to: "/kb/new" })}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Add New Article
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-[var(--color-border)]">
        {(["all", "draft", "review", "published", "archived"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() =>
              navigate({
                search: { ...search, status: tab === "all" ? undefined : tab, page: 1 },
              })
            }
            className={`px-3 py-2 text-sm font-medium ${
              (search.status ?? "all") === (tab === "all" ? undefined : tab)
                ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)]"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Article list -- placeholder for full list table implementation */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
        {!articles ? (
          <div className="p-8 text-center text-[var(--color-muted-foreground)]">Loading...</div>
        ) : articles.items.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted-foreground)]">
            No articles found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Author</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Views</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {articles.items.map((article: any) => (
                <tr
                  key={article._id}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/50 cursor-pointer"
                  onClick={() => navigate({ to: "/kb/$articleId/edit", params: { articleId: article._id } })}
                >
                  <td className="px-4 py-3 font-medium">{article.title}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                    {article.author?.displayName ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      article.status === "published"
                        ? "bg-green-500/10 text-green-600"
                        : article.status === "draft"
                          ? "bg-yellow-500/10 text-yellow-600"
                          : article.status === "review"
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-black/5 text-[var(--color-muted-foreground)]"
                    }`}>
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{article.viewCount}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
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
