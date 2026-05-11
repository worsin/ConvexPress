/**
 * EmailTemplateList - Template list table for the email settings page.
 *
 * Shows all 25 email templates with category badges, priority, status,
 * and sent count. Clicking a template name navigates to the full-page
 * template editor.
 *
 * Wired to: api.emails.queries.listTemplates
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { Link } from "@tanstack/react-router";
import { Mail, ChevronDown, Search } from "lucide-react";

import { api } from "@backend/convex/_generated/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import {
  EMAIL_CATEGORY_CONFIG,
  EMAIL_PRIORITY_CONFIG,
  CATEGORY_OPTIONS,
} from "@/lib/email/constants";
import type { EmailCategory, EmailPriority, EmailTemplateListItem } from "@/lib/email/types";

export function EmailTemplateList() {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const templates = useQuery(api.emails.queries.listTemplates, {
    category: categoryFilter || undefined,
  });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!searchQuery.trim()) return templates;

    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t: EmailTemplateListItem) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)),
    );
  }, [templates, searchQuery]);

  if (templates === undefined) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <CardTitle>Email Templates</CardTitle>
            <span className="text-xs text-muted-foreground">
              ({filteredTemplates.length})
            </span>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-44 border border-input bg-transparent pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
              />
            </div>

            {/* Category filter */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-7 appearance-none border border-input bg-transparent pl-2 pr-7 text-xs text-foreground focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Template</span>
          <span>Category</span>
          <span>Priority</span>
          <span>Status</span>
          <span className="text-right">Sent</span>
        </div>

        {/* Template rows */}
        {filteredTemplates.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No templates found.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTemplates.map((template: EmailTemplateListItem) => (
              <TemplateRow key={template._id} template={template} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplateRow({ template }: { template: EmailTemplateListItem }) {
  const categoryConfig =
    EMAIL_CATEGORY_CONFIG[template.category as EmailCategory];
  const priorityConfig =
    EMAIL_PRIORITY_CONFIG[template.priority as EmailPriority];

  return (
    <div className="grid grid-cols-[1fr_120px_100px_80px_80px] items-center gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-muted/50">
      {/* Name + slug */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <Link
          to="/settings/email/templates/$templateSlug"
          params={{ templateSlug: template.slug }}
          className="font-medium text-foreground hover:text-primary truncate"
        >
          {template.name}
        </Link>
        <span className="text-muted-foreground truncate">{template.slug}</span>
      </div>

      {/* Category badge */}
      <div>
        {categoryConfig && (
          <span
            className={cn(
              "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
              categoryConfig.className,
            )}
          >
            {categoryConfig.label}
          </span>
        )}
      </div>

      {/* Priority badge */}
      <div>
        {priorityConfig && (
          <span
            className={cn(
              "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
              priorityConfig.className,
            )}
          >
            {priorityConfig.label}
          </span>
        )}
      </div>

      {/* Active status */}
      <div>
        <span
          className={cn(
            "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
            template.isActive
              ? "bg-success/10 text-success border-success/20"
              : "bg-black/5 text-muted-foreground border-border",
          )}
        >
          {template.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Sent count */}
      <div className="text-right text-muted-foreground">
        {template.totalSent.toLocaleString()}
      </div>
    </div>
  );
}
