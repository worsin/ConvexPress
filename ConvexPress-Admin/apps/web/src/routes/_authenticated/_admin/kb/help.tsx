/**
 * In-app help - /admin/kb/help
 *
 * Help spots are the "?" buttons in the applications that use this knowledge
 * base: a screen, a panel, a field. Applications register their spots; here
 * editors write each spot's short summary (what the help panel shows first)
 * and choose, in order, the articles it opens to. Spots with nothing
 * published, and keys articles use that no application registered, stand out.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { ArrowDown, ArrowUp, CircleHelp, Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/kb/help")({
  component: () => (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <HelpSpotsPage />
    </RoutePermissionGuard>
  ),
});

type Filter = "all" | "missing" | "unregistered";
const SUMMARY_MAX = 500;
const inputClass = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/30";

function errorMessage(err: unknown, fallback: string) {
  return (err as { data?: { message?: string } })?.data?.message ?? fallback;
}

function HelpSpotsPage() {
  const spots = useQuery(api.kb.helpContexts.list);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (spots ?? []).filter((spot) => {
      if (filter === "missing" && spot.publishedCount > 0) return false;
      if (filter === "unregistered" && spot.registered) return false;
      return !q || spot.key.includes(q) || spot.label.toLowerCase().includes(q) || (spot.routeHint ?? "").toLowerCase().includes(q);
    });
    const bySurface = new Map<string, typeof rows>();
    for (const row of rows) {
      // A surface is an app key ("doctor-portal"); the heading reads it as words.
      const surface = row.registered ? (row.surface ? row.surface.replace(/[-_.]+/g, " ") : "Added by editors") : "Not registered by any app";
      bySurface.set(surface, [...(bySurface.get(surface) ?? []), row]);
    }
    return [...bySurface.entries()];
  }, [spots, filter, search]);

  const missing = (spots ?? []).filter((spot) => spot.publishedCount === 0).length;
  const unregistered = (spots ?? []).filter((spot) => !spot.registered).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CircleHelp className="h-5 w-5 text-primary" aria-hidden="true" /> In-app help
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-foreground/60">
          Help spots are the “?” buttons in your applications. Give each one a short summary — the first thing the help panel shows — and choose the articles it opens to,
          in order. Articles join spots from their own editor too.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([
          ["all", `All${spots ? ` (${spots.length})` : ""}`],
          ["missing", `No published help (${missing})`],
          ["unregistered", `Not registered (${unregistered})`],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn("rounded-full border px-3 py-1 text-xs", filter === value ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground/60 hover:bg-muted")}
          >
            {label}
          </button>
        ))}
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a spot" className={cn(inputClass, "ml-auto w-64")} />
      </div>

      {spots === undefined ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground/50">
          {spots.length === 0 ? "No application has registered help spots yet." : "No spots match."}
        </div>
      ) : (
        groups.map(([surface, rows]) => (
          <section key={surface} className="rounded-lg border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">
              {surface} <span className="font-normal normal-case text-foreground/40">· {rows.length}</span>
            </h2>
            <ul>
              {rows.map((spot) => (
                <li key={spot.key} className="border-b border-border last:border-0">
                  <button type="button" onClick={() => setOpen(open === spot.key ? null : spot.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{spot.label}</div>
                      <div className="truncate font-mono text-[11px] text-foreground/50">
                        {spot.key}
                        {spot.routeHint ? ` · ${spot.routeHint}` : ""}
                      </div>
                    </div>
                    {!spot.summary && spot.registered && <span className="text-[11px] text-foreground/40">No summary</span>}
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                        spot.publishedCount > 0 ? "border-success/30 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning",
                      )}
                    >
                      {spot.publishedCount > 0 ? `${spot.publishedCount} article${spot.publishedCount === 1 ? "" : "s"}` : "No published help"}
                    </span>
                  </button>
                  {open === spot.key && <SpotEditor spotKey={spot.key} onDone={() => setOpen(null)} />}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function SpotEditor({ spotKey, onDone }: { spotKey: string; onDone: () => void }) {
  const detail = useQuery(api.kb.helpContexts.get, { key: spotKey });
  const save = useMutation(api.kb.helpContexts.save);
  const setArticles = useMutation(api.kb.helpContexts.setArticles);
  const remove = useMutation(api.kb.helpContexts.remove);
  const [label, setLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [articles, setArticleList] = useState<Array<{ _id: Id<"kb_articles">; title: string; status: string; visibility: string; audiences: string[] }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const results = usePaginatedQuery(api.kb.queries.list, adding.trim() ? { search: adding.trim() } : "skip", { initialNumItems: 8 });

  useEffect(() => {
    if (!detail || loaded) return;
    setLabel(detail.spot?.label ?? spotKey);
    setSummary(detail.spot?.summary ?? "");
    setArticleList(detail.articles);
    setLoaded(true);
  }, [detail, loaded, spotKey]);

  if (!detail || !loaded) {
    return (
      <div className="flex h-20 items-center justify-center border-t border-border">
        <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
      </div>
    );
  }

  const registered = detail.spot?.source === "manifest";

  function move(index: number, delta: number) {
    setArticleList((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await save({ key: spotKey, label: label.trim() || spotKey, summary });
      await setArticles({ key: spotKey, articleIds: articles.map((article) => article._id) });
      toast.success("Help spot saved");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the help spot"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 border-t border-border bg-muted/30 px-4 py-4 md:grid-cols-2">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground/70">Label</span>
          <input
            className={cn(inputClass, registered && "cursor-default text-foreground/60")}
            value={label}
            readOnly={registered}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-medium text-foreground/70">
            Summary <span className={cn("font-normal", summary.length > SUMMARY_MAX ? "text-destructive" : "text-foreground/40")}>{summary.length}/{SUMMARY_MAX}</span>
          </span>
          <textarea
            className={cn(inputClass, "resize-y")}
            rows={4}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="One or two sentences on what this is and what to do here. The panel shows it above the articles."
          />
        </label>
        {registered && (
          <p className="text-[11px] text-foreground/50">Registered by {detail.spot?.surface}. Its label and route follow the app; your summary is kept.</p>
        )}
      </div>
      <div className="space-y-2">
        <span className="block text-xs font-medium text-foreground/70">Articles, in the order the panel lists them</span>
        {articles.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-foreground/50">No articles yet. Add one below.</p>
        ) : (
          <ol className="space-y-1">
            {articles.map((article, index) => (
              <li key={article._id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm">
                <span className="w-5 text-center text-xs text-foreground/40">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{article.title}</span>
                {article.status !== "published" && <span className="text-[11px] text-warning">{article.status}</span>}
                {article.audiences.length > 0 && <span className="text-[11px] text-foreground/40">{article.audiences.join(", ")}</span>}
                <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Move down" disabled={index === articles.length - 1} onClick={() => move(index, 1)} className="rounded p-0.5 hover:bg-muted disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Remove" onClick={() => setArticleList((list) => list.filter((item) => item._id !== article._id))} className="rounded p-0.5 text-destructive hover:bg-destructive/10">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="relative">
          <Plus className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-foreground/40" aria-hidden="true" />
          <input className={cn(inputClass, "pl-7")} value={adding} onChange={(event) => setAdding(event.target.value)} placeholder="Add an article…" />
          {adding.trim() && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
              {results.results.filter((article) => !articles.some((item) => item._id === article._id)).length === 0 ? (
                <li className="px-3 py-2 text-xs text-foreground/50">{results.isLoading ? "Searching…" : "No articles match."}</li>
              ) : (
                results.results
                  .filter((article) => !articles.some((item) => item._id === article._id))
                  .map((article) => (
                    <li key={article._id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setArticleList((list) => [...list, { _id: article._id, title: article.title, status: article.status, visibility: article.visibility, audiences: article.audiences }]);
                          setAdding("");
                        }}
                      >
                        {article.title}
                        <span className="ml-2 text-[11px] text-foreground/40">{article.status}</span>
                      </button>
                    </li>
                  ))
              )}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 md:col-span-2">
        {detail.spot?.source !== "manifest" && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Delete the help spot “${label || spotKey}”? Articles stay; they just stop showing here.`)) return;
              void remove({ key: spotKey })
                .then(() => {
                  toast.success("Help spot deleted");
                  onDone();
                })
                .catch((err: unknown) => toast.error(errorMessage(err, "Couldn't delete the help spot")));
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete spot
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onDone} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || summary.length > SUMMARY_MAX}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
