/**
 * Link to a web address, or to another help article (optionally one of its
 * sections). Article links are stored by id, so they survive retitling and
 * slug changes, and readers who can't see the target get plain text.
 */
import { usePaginatedQuery } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { FileText, Globe } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type KbLinkValue = { href: string | null; articleId: string | null; anchor: string | null };

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/30";

export function LinkDialog({
  open,
  initial,
  currentArticleId,
  onOpenChange,
  onSubmit,
  onRemove,
}: {
  open: boolean;
  initial: KbLinkValue | null;
  currentArticleId?: Id<"kb_articles">;
  onOpenChange: (open: boolean) => void;
  /** `label` is the text to insert when nothing is selected. */
  onSubmit: (value: KbLinkValue, label: string) => void;
  onRemove: () => void;
}) {
  const [mode, setMode] = useState<"url" | "article">("url");
  const [href, setHref] = useState("");
  const [search, setSearch] = useState("");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initial?.articleId ? "article" : "url");
    setHref(initial?.href ?? "");
    setArticleId(initial?.articleId ?? null);
    setAnchor(initial?.anchor ?? null);
    setSearch("");
  }, [open, initial]);

  const results = usePaginatedQuery(api.kb.queries.list, open && mode === "article" ? { search: search.trim() || undefined } : "skip", { initialNumItems: 8 });
  const target = useQuery(api.kb.queries.getById, articleId ? { articleId: articleId as Id<"kb_articles"> } : "skip");
  const candidates = results.results.filter((article) => article._id !== currentArticleId);

  const valid = mode === "url" ? href.trim().length > 0 : articleId !== null;
  function submit() {
    if (!valid) return;
    if (mode === "url") onSubmit({ href: href.trim(), articleId: null, anchor: null }, href.trim());
    else onSubmit({ href: null, articleId, anchor }, target?.title ?? "this article");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>Point to a web page, or to another help article so the link follows it if it moves.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(["url", "article"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm", mode === value ? "bg-card font-medium shadow-sm" : "text-foreground/60")}
            >
              {value === "url" ? <Globe className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
              {value === "url" ? "Web address" : "Help article"}
            </button>
          ))}
        </div>
        {mode === "url" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground/60">Address</span>
            <input
              autoFocus
              className={inputClass}
              value={href}
              placeholder="https://… or /pricing or mailto:…"
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
          </label>
        ) : (
          <div className="space-y-2">
            <input autoFocus className={inputClass} value={search} placeholder="Search articles" onChange={(event) => setSearch(event.target.value)} />
            <ul className="max-h-56 overflow-y-auto rounded-md border border-border" aria-label="Articles">
              {candidates.length === 0 ? (
                <li className="px-3 py-3 text-sm text-foreground/50">{results.isLoading ? "Searching…" : "No articles match."}</li>
              ) : (
                candidates.map((article) => (
                  <li key={article._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setArticleId(article._id);
                        setAnchor(null);
                      }}
                      className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted", articleId === article._id && "bg-primary/10")}
                    >
                      <span className="truncate">{article.title}</span>
                      <span className="shrink-0 text-[11px] text-foreground/50">
                        {article.visibility === "internal" ? "Internal · " : ""}
                        {article.status}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {target && target.outline.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground/60">Section (optional)</span>
                <select className={inputClass} value={anchor ?? ""} onChange={(event) => setAnchor(event.target.value || null)}>
                  <option value="">Top of “{target.title}”</option>
                  {target.outline.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.level === 3 ? "  " : ""}
                      {entry.text}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <DialogFooter>
          {initial && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              Remove link
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {initial ? "Update link" : "Add link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
