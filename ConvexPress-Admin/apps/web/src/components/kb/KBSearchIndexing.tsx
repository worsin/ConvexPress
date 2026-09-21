import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react/cache";
import type { Id } from "@backend/convex/_generated/dataModel";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

const phases: Record<string, string> = {
  settings: "Checking index settings", settingsSubmitting: "Updating index settings",
  settingsPoll: "Waiting for index settings", document: "Preparing article",
  documentSubmitting: "Sending article change", documentPoll: "Waiting for article change",
};

export function KBSearchIndexing() {
  const { can } = useAuth();
  return can("manage_options") ? <IndexingControls /> : null;
}

function IndexingControls() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ articleId: Id<"kb_articles">; title: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const articles = usePaginatedQuery(api.kb.searchJobs.articleOptions, { search: query }, { initialNumItems: 10 });
  const jobs = usePaginatedQuery(api.kb.searchJobs.list, {}, { initialNumItems: 10 });
  const sync = useAction(api.kb.meilisearch.syncArticle);
  const remove = useAction(api.kb.meilisearch.removeArticle);
  const resume = useMutation(api.kb.searchJobs.resume);
  const reconcile = useAction(api.kb.searchReconciliation.reconcile);

  async function run(key: string, action: () => Promise<unknown>) {
    setPending(key);
    try {
      await action();
      if (mounted.current) toast.success("Indexing job updated. Follow its progress below.");
    } catch {
      if (mounted.current) toast.error("The indexing request could not be completed. Check the saved provider settings and job status before trying again.");
    } finally { if (mounted.current) setPending(null); }
  }

  return <section aria-labelledby="kb-indexing-heading" className="space-y-5 rounded-lg border border-border bg-card p-5">
    <div>
      <h2 id="kb-indexing-heading" className="text-base font-semibold">Search indexing</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sync an article with Meilisearch or remove it from the search index. Operations use the saved settings for this website environment.</p>
    </div>
    <div className="space-y-2">
      <label htmlFor="kb-index-article-search" className="text-sm font-medium">Find an article by title</label>
      <Input id="kb-index-article-search" value={search} maxLength={200} placeholder="Search article titles…" onChange={event => { setSearch(event.target.value); setSelected(null); }} />
      <fieldset aria-label="Articles to index" className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border" disabled={pending !== null || query !== search.trim()}>
        {articles.results.map(article => <label key={article.articleId} className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-muted/50 focus-within:bg-muted/50">
          <input type="radio" name="kb-index-article" value={article.articleId} checked={selected?.articleId === article.articleId} onChange={() => setSelected({articleId:article.articleId,title:article.title})} className="mt-1 accent-primary" />
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{article.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{article.status} · {article.meilisearchSynced ? "Index is current" : "Index needs sync"}</span></span>
        </label>)}
        {articles.status === "LoadingFirstPage" && <p role="status" className="p-3 text-sm text-muted-foreground">Loading articles…</p>}
        {articles.results.length === 0 && articles.status !== "LoadingFirstPage" && <p className="p-3 text-sm text-muted-foreground">No articles in this page. {articles.status === "CanLoadMore" ? "Load more to continue." : "Try a different title."}</p>}
      </fieldset>
      {articles.status !== "Exhausted" && articles.status !== "LoadingFirstPage" && <Button variant="outline" size="sm" disabled={articles.status !== "CanLoadMore"} onClick={() => articles.loadMore(10)}>{articles.status === "LoadingMore" ? "Loading…" : "Load more articles"}</Button>}
    </div>
    <div className="space-y-2">
      {selected && <p className="text-sm text-muted-foreground">Selected: <span className="font-medium text-foreground">{selected.title}</span></p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!selected || pending !== null} onClick={() => selected && void run("sync", () => sync({articleId:selected.articleId}))}>{pending === "sync" ? "Starting sync…" : "Sync selected article"}</Button>
        <Button variant="outline" disabled={!selected || pending !== null} onClick={() => selected && void run("remove", () => remove({articleId:selected.articleId}))}>{pending === "remove" ? "Starting removal…" : "Remove from index"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Removing an index entry keeps the article and its publication status unchanged.</p>
    </div>
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Recent indexing jobs</h3>
      {jobs.status === "LoadingFirstPage" && <p role="status" className="text-sm text-muted-foreground">Loading jobs…</p>}
      {jobs.results.length === 0 && jobs.status !== "LoadingFirstPage" && <p className="text-sm text-muted-foreground">No jobs in this page.</p>}
      <ul className="space-y-3" aria-label="Indexing job history">
        {jobs.results.map(job => <li key={job.jobId} data-job-id={job.jobId} className="space-y-2 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-words text-sm font-medium">{job.title}</p><Badge variant={job.status === "uncertain" || job.status === "failed" ? "destructive" : "secondary"}>{job.status === "uncertain" ? "Needs reconciliation" : job.status}</Badge></div>
          <p className="text-xs text-muted-foreground">{job.operation === "sync" ? "Sync" : "Removal"} · {job.status === "complete" ? "Finished" : phases[job.phase]}{job.taskUid !== undefined ? ` · Provider task ${job.taskUid}` : ""}{job.reconciledBy === "document" ? " · Indexed document verified" : job.reconciledBy === "task" ? " · Provider receipt verified" : ""}</p>
          <p className="text-xs text-muted-foreground">Started <time dateTime={new Date(job.createdAt).toISOString()}>{new Date(job.createdAt).toLocaleString()}</time> · Updated <time dateTime={new Date(job.updatedAt).toISOString()}>{new Date(job.updatedAt).toLocaleString()}</time></p>
          {job.message && <p className="text-sm">{job.message}</p>}
          {job.status === "uncertain" && <p className="text-sm">The provider may have accepted the change. Further writes for this article are held until the acknowledgement is reconciled.</p>}
          {job.status === "uncertain" && <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void run(job.jobId, () => reconcile({jobId:job.jobId}))}>{pending === job.jobId ? "Checking provider…" : "Check provider receipt"}</Button>}
          {job.status === "stale" && <p className="text-sm">The article changed during indexing. Sync its current version to update the index.</p>}
          {job.status === "paused" && <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void run(job.jobId, () => resume({jobId:job.jobId}))}>{pending === job.jobId ? "Resuming…" : "Resume indexing"}</Button>}
        </li>)}
      </ul>
      {jobs.status !== "Exhausted" && jobs.status !== "LoadingFirstPage" && <Button variant="outline" size="sm" disabled={jobs.status !== "CanLoadMore"} onClick={() => jobs.loadMore(10)}>{jobs.status === "LoadingMore" ? "Loading…" : "Load older jobs"}</Button>}
    </div>
  </section>;
}
