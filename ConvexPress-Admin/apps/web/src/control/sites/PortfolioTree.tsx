/**
 * Portfolio tree — the left column of the Sites workspace.
 *
 * Organizations fold; businesses and websites sit beneath them with
 * environment health dots. Every row is a real button so the tree is
 * keyboard-operable, and inline "+" affordances add a business or website in
 * place.
 */

import { ChevronRight, Globe2, LayoutGrid, Plus, Users } from "lucide-react";
import { useState } from "react";

import { HealthDot } from "@/components/shell/EnvironmentChip";
import { cn } from "@/lib/utils";
import {
  sameNode,
  type PortfolioCounts,
  type SitesNode,
  type TreeOrganization,
} from "./sites-model";

interface PortfolioTreeProps {
  tree: TreeOrganization[];
  allCount: PortfolioCounts;
  node: SitesNode;
  onSelect: (node: SitesNode) => void;
  onAddWebsite: (scope: { organizationId: string; businessId: string }) => void;
  onNewBusiness: (organizationId: string) => void;
  filtering: boolean;
}

export function PortfolioTree({
  tree,
  allCount,
  node,
  onSelect,
  onAddWebsite,
  onNewBusiness,
  filtering,
}: PortfolioTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (organizationId: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(organizationId)) next.delete(organizationId);
      else next.add(organizationId);
      return next;
    });

  const rowClass = (active: boolean) =>
    cn(
      "group flex w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors",
      active
        ? "bg-card text-foreground shadow-soft"
        : "text-ink-2 hover:bg-card/70 hover:text-foreground",
    );

  return (
    <nav
      aria-label="Portfolio"
      className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar/60 px-3 py-3 md:flex"
    >
      <ul role="list" className="space-y-0.5">
        <li>
          <button
            type="button"
            aria-current={node.type === "overview" ? "page" : undefined}
            onClick={() => onSelect({ type: "overview" })}
            className={cn(rowClass(node.type === "overview"), "h-8 font-medium")}
          >
            <LayoutGrid aria-hidden="true" className="size-4 text-muted-foreground" />
            Overview
            <span className="ml-auto text-[11px] text-muted-foreground">
              {allCount.websites} {allCount.websites === 1 ? "site" : "sites"}
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            aria-current={node.type === "people" ? "page" : undefined}
            onClick={() => onSelect({ type: "people" })}
            className={cn(rowClass(node.type === "people"), "h-8 font-medium")}
          >
            <Users aria-hidden="true" className="size-4 text-muted-foreground" />
            People
          </button>
        </li>
      </ul>

      <div className="mb-1 mt-4 flex items-center justify-between px-2">
        <span className="eyebrow">Organizations</span>
      </div>

      {tree.length === 0 && (
        <p className="px-2 py-3 text-[12.5px] leading-5 text-muted-foreground">
          {filtering ? "Nothing matches that search." : "No organizations yet. Add a website to create one."}
        </p>
      )}

      <ul role="list" className="space-y-1">
        {tree.map((organization) => {
          const open = filtering || !collapsed.has(organization.organizationId);
          const orgNode: SitesNode = { type: "organization", id: organization.organizationId };
          const siteCount = organization.businesses.reduce(
            (sum, business) => sum + business.websites.length,
            0,
          );
          return (
            <li key={organization.organizationId}>
              <div className={cn(rowClass(sameNode(node, orgNode)), "h-8 pr-1")}>
                <button
                  type="button"
                  aria-label={`${open ? "Collapse" : "Expand"} ${organization.name}`}
                  aria-expanded={open}
                  onClick={() => toggle(organization.organizationId)}
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn("size-3.5 transition-transform", open && "rotate-90")}
                  />
                </button>
                <button
                  type="button"
                  aria-current={sameNode(node, orgNode) ? "page" : undefined}
                  onClick={() => onSelect(orgNode)}
                  className="min-w-0 flex-1 truncate py-1 text-left font-semibold text-foreground"
                >
                  {organization.name}
                </button>
                <span className="text-[11px] text-muted-foreground">{siteCount}</span>
                <button
                  type="button"
                  aria-label={`New business in ${organization.name}`}
                  title="New business"
                  onClick={() => onNewBusiness(organization.organizationId)}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                </button>
              </div>

              {open && (
                <ul role="list" className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  {organization.businesses.map((business) => {
                    const businessNode: SitesNode = { type: "business", id: business.businessId };
                    return (
                      <li key={business.businessId}>
                        <div className={cn(rowClass(sameNode(node, businessNode)), "h-8 pr-1")}>
                          <button
                            type="button"
                            aria-current={sameNode(node, businessNode) ? "page" : undefined}
                            onClick={() => onSelect(businessNode)}
                            className="min-w-0 flex-1 truncate py-1 text-left font-medium"
                          >
                            {business.name}
                          </button>
                          <span className="text-[11px] text-muted-foreground">
                            {business.websites.length}
                          </span>
                          <button
                            type="button"
                            aria-label={`Add website to ${business.name}`}
                            title="Add website"
                            onClick={() =>
                              onAddWebsite({
                                organizationId: organization.organizationId,
                                businessId: business.businessId,
                              })
                            }
                            className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Plus aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>
                        {business.websites.length > 0 && (
                          <ul role="list" className="ml-2 space-y-0.5 pl-2">
                            {business.websites.map((website) => {
                              const websiteNode: SitesNode = { type: "website", id: website.websiteId };
                              return (
                                <li key={website.websiteId}>
                                  <button
                                    type="button"
                                    aria-current={sameNode(node, websiteNode) ? "page" : undefined}
                                    onClick={() => onSelect(websiteNode)}
                                    className={cn(rowClass(sameNode(node, websiteNode)), "min-h-[38px] py-1")}
                                  >
                                    <Globe2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                                    <span className="flex min-w-0 flex-1 flex-col leading-[1.2]">
                                      <span className="truncate font-medium">{website.title}</span>
                                      <span className="truncate text-[11px] text-muted-foreground">
                                        {website.primaryDomain}
                                      </span>
                                    </span>
                                    <span
                                      className="flex shrink-0 items-center gap-1"
                                      aria-label={
                                        website.environments.length
                                          ? `${website.environments.length} environments`
                                          : "No environments"
                                      }
                                    >
                                      {website.environments.slice(0, 4).map((environment) => (
                                        <HealthDot key={environment.instanceId} environment={environment} />
                                      ))}
                                      {website.environments.length === 0 && (
                                        <span className="size-[7px] rounded-full border border-dashed border-line-strong" />
                                      )}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                  {organization.businesses.length === 0 && (
                    <li className="px-2 py-1.5 text-[12px] text-muted-foreground">No businesses yet.</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
