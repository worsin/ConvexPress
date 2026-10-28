/**
 * Content health - /admin/kb/health
 *
 * What in the knowledge base needs an editor: articles due for review,
 * articles readers say don't help (and why), searches that find nothing,
 * in-app help spots with no article, broken links between articles, and
 * images without alt text. Backed by api.kb.health.report.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { AlertTriangle, CheckCircle2, CircleHelp, Clock, ImageOff, Link2Off, Loader2, SearchX, ThumbsDown } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";

export const Route = createFileRoute("/_authenticated/_admin/kb/health")({
  component: () => (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <HealthPage />
    </RoutePermissionGuard>
  ),
});

const REASON_LABELS: Record<string, string> = { outdated: "Out of date", incorrect: "Wrong", unclear: "Unclear", incomplete: "Missing something", other: "Other" };

function Section({ icon, title, hint, count, children }: { icon: ReactNode; title: string; hint: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className={count > 0 ? "rounded-full bg-warning/15 px-2 text-xs text-warning" : "rounded-full bg-success/15 px-2 text-xs text-success"}>{count}</span>
        <p className="ml-auto hidden text-xs text-foreground/50 md:block">{hint}</p>
      </header>
      {count === 0 ? (
        <p className="flex items-center gap-1.5 px-4 py-3 text-xs text-foreground/50">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" /> Nothing here.
        </p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}

function ArticleLink({ id, title }: { id: string; title: string }) {
  return (
    <Link to="/kb/$articleId/edit" params={{ articleId: id }} className="font-medium hover:text-primary hover:underline">
      {title}
    </Link>
  );
}

function HealthPage() {
  const report = useQuery(api.kb.health.report);
  const markReviewed = useMutation(api.kb.mutations.markReviewed);

  if (report === undefined) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
      </div>
    );
  }
  if (report === null) return <p className="py-16 text-center text-sm text-foreground/50">The knowledge base is turned off.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Content health</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {report.publishedCount} published articles checked {new Date(report.generatedAt).toLocaleTimeString()}.
          {report.truncated && " Lists cover the most recent activity only."}
        </p>
      </div>

      <Section icon={<Clock className="h-4 w-4 text-foreground/50" />} title="Due for review" hint="Past their review date. Open to check, or mark reviewed." count={report.dueForReview.length}>
        {report.dueForReview.map((row) => (
          <li key={row._id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <ArticleLink id={row._id} title={row.title} />
            <span className="text-xs text-foreground/50">
              due {new Date(row.dueAt).toLocaleDateString()}
              {row.owner ? ` · ${row.owner.displayName}` : ""}
            </span>
            <button
              type="button"
              onClick={() => void markReviewed({ articleId: row._id }).then(() => toast.success(`Marked “${row.title}” reviewed`), () => toast.error("Couldn't mark it reviewed"))}
              className="ml-auto rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
            >
              Mark reviewed
            </button>
          </li>
        ))}
      </Section>

      <Section icon={<ThumbsDown className="h-4 w-4 text-foreground/50" />} title="Not helping readers" hint="At least five votes, mostly “no”." count={report.notHelping.length}>
        {report.notHelping.map((row) => (
          <li key={row._id} className="space-y-1 px-4 py-2 text-sm">
            <div className="flex items-center gap-3">
              <ArticleLink id={row._id} title={row.title} />
              <span className="text-xs text-foreground/50">
                {row.notHelpfulVotes} no · {row.helpfulVotes} yes
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(row.reasons)
                .filter(([, count]) => count > 0)
                .map(([reason, count]) => (
                  <span key={reason} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground/70">
                    {REASON_LABELS[reason]} · {count}
                  </span>
                ))}
            </div>
            {row.comments.map((comment, index) => (
              <p key={index} className="border-l-2 border-border pl-2 text-xs italic text-foreground/60">
                “{comment}”
              </p>
            ))}
          </li>
        ))}
      </Section>

      <Section icon={<SearchX className="h-4 w-4 text-foreground/50" />} title="Searches that found nothing" hint="Last 30 days. Each is an article someone needed." count={report.failedSearches.length}>
        {report.failedSearches.map((row) => (
          <li key={row.query} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="font-medium">“{row.query}”</span>
            <span className="text-xs text-foreground/50">
              {row.count}× · last {new Date(row.lastSearchedAt).toLocaleDateString()}
            </span>
            <Link to="/kb/new" className="ml-auto rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">
              Write it
            </Link>
          </li>
        ))}
      </Section>

      <Section icon={<CircleHelp className="h-4 w-4 text-foreground/50" />} title="Help spots with no article" hint="Readers who press “?” here find nothing." count={report.emptyHelpSpots.length}>
        {report.emptyHelpSpots.map((spot) => (
          <li key={spot.key} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="font-medium">{spot.label}</span>
            <span className="font-mono text-[11px] text-foreground/50">{spot.key}</span>
            {spot.surface && <span className="text-xs text-foreground/40">{spot.surface}</span>}
            <Link to="/kb/help" className="ml-auto rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">
              Choose articles
            </Link>
          </li>
        ))}
      </Section>

      <Section icon={<Link2Off className="h-4 w-4 text-foreground/50" />} title="Broken links" hint="Readers see these links as plain text." count={report.brokenLinks.length}>
        {report.brokenLinks.map((row) => (
          <li key={row._id} className="px-4 py-2 text-sm">
            <ArticleLink id={row._id} title={row.title} />
            <ul className="mt-1 space-y-0.5">
              {row.targets.map((target) => (
                <li key={target._id} className="flex items-center gap-1.5 text-xs text-foreground/60">
                  <AlertTriangle className="h-3 w-3 text-warning" aria-hidden="true" />
                  {target.problem === "missing" ? "links to a deleted article" : <>links to “{target.title}”, which isn’t published</>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </Section>

      <Section icon={<ImageOff className="h-4 w-4 text-foreground/50" />} title="Images without alt text" hint="Screen readers can’t describe these images." count={report.imagesWithoutAlt.length}>
        {report.imagesWithoutAlt.map((row) => (
          <li key={row._id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <ArticleLink id={row._id} title={row.title} />
            <span className="text-xs text-foreground/50">
              {row.figures} image{row.figures === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </Section>
    </div>
  );
}
