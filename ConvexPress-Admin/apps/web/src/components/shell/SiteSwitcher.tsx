/**
 * Site switcher.
 *
 * One slim control under the wordmark shows only the active website. The
 * popover holds the rest of the hierarchy: search, recently opened sites,
 * websites grouped under "Organization › Business", environment health dots
 * per row, and folded rows for other organizations. Keyboard: ⌘⇧S / Ctrl⇧S
 * opens it, arrows move, Enter opens, Escape closes.
 */

import { ChevronDown, ChevronRight, Globe2, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useControlShell } from "@/control/ControlShellContext";
import { cn } from "@/lib/utils";
import { HealthDot } from "./EnvironmentChip";
import { initialsFor } from "./environment-presentation";
import {
  buildSections,
  environmentsForWebsite,
  flattenRows,
  moveHighlight,
  pushRecentWebsite,
  type SwitcherRow,
} from "./site-switcher-model";

const RECENT_LIMIT = 5;

function recentStorageKey(operatorId: string) {
  return `convexpress:recent-websites:${operatorId}`;
}

function readRecent(operatorId: string): string[] {
  try {
    const raw = localStorage.getItem(recentStorageKey(operatorId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(operatorId: string, value: string[]) {
  try {
    localStorage.setItem(recentStorageKey(operatorId), JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

export function SiteSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const shell = useControlShell();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const [expandedOrganizations, setExpandedOrganizations] = useState<Set<string>>(
    () => new Set(),
  );
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const operatorId = shell?.operator.id ?? "";
  useEffect(() => {
    if (operatorId) setRecent(readRecent(operatorId));
  }, [operatorId]);

  // Remember the active website so it surfaces under "Recent" next time.
  const selectedWebsiteId = shell?.selectedWebsite?.websiteId
    ? String(shell.selectedWebsite.websiteId)
    : null;
  useEffect(() => {
    if (!operatorId || !selectedWebsiteId) return;
    setRecent((previous) => {
      const next = pushRecentWebsite(previous, selectedWebsiteId, RECENT_LIMIT);
      writeRecent(operatorId, next);
      return next;
    });
  }, [operatorId, selectedWebsiteId]);

  // Global shortcut.
  useEffect(() => {
    if (!shell) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shell]);

  const sections = useMemo(() => {
    if (!shell) return [];
    return buildSections(
      {
        organizations: shell.context.organizations.map((o) => ({
          organizationId: String(o.organizationId),
          name: o.name,
        })),
        businesses: shell.context.businesses.map((b) => ({
          businessId: String(b.businessId),
          organizationId: String(b.organizationId),
          name: b.name,
        })),
        websites: shell.context.websites.map((w) => ({
          websiteId: String(w.websiteId),
          businessId: String(w.businessId),
          organizationId: String(w.organizationId),
          title: w.title,
          primaryDomain: w.primaryDomain,
        })),
        environments: [],
      },
      {
        query,
        selectedWebsiteId,
        selectedOrganizationId: shell.selection.organizationId,
        expandedOrganizationIds: expandedOrganizations,
        recentWebsiteIds: recent,
      },
    );
  }, [shell, query, selectedWebsiteId, expandedOrganizations, recent]);

  const rows = useMemo(() => flattenRows(sections), [sections]);
  const environments = useMemo(
    () =>
      (shell?.context.environments ?? []).map((environment) => ({
        instanceId: String(environment.instanceId),
        websiteId: String(environment.websiteId),
        kind: environment.kind,
        label: environment.label,
        health: environment.health,
        compatibility: environment.compatibility,
      })),
    [shell],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  }, []);

  const activate = useCallback(
    (row: SwitcherRow) => {
      if (!shell) return;
      if (row.kind === "folded") {
        setExpandedOrganizations((previous) => {
          const next = new Set(previous);
          next.add(row.organizationId);
          return next;
        });
        return;
      }
      if (row.kind === "business") {
        shell.selectBusiness(row.businessId);
        close();
        return;
      }
      shell.selectWebsite(row.website.websiteId);
      close();
    },
    [shell, close],
  );

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (highlight < 0) return;
    const element = document.getElementById(`${listId}-row-${highlight}`);
    element?.scrollIntoView({ block: "nearest" });
  }, [highlight, listId]);

  if (!shell) return null;

  const website = shell.selectedWebsite;
  const business = shell.selectedBusiness;
  const title = website?.title ?? (business ? business.name : "Choose a website");
  const domain = website?.primaryDomain
    ?? (business ? "No website selected" : `${shell.context.websites.length} available`);
  const tileText = website
    ? initialsFor(website.title)
    : business
      ? initialsFor(business.name)
      : "";
  const canManage = true;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((value) => moveHighlight(value, 1, rows.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((value) => moveHighlight(value, -1, rows.length));
    } else if (event.key === "Enter") {
      const row = rows[highlight] ?? rows[0];
      if (row) {
        event.preventDefault();
        activate(row);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  let rowIndex = -1;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <PopoverTrigger
        aria-label="Switch website"
        aria-haspopup="dialog"
        title={collapsed ? title : undefined}
        className={cn(
          "app-no-drag group/switch flex w-full items-center gap-2.5 rounded-xl border border-border bg-card text-left shadow-soft transition-colors",
          "hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          collapsed ? "h-10 justify-center px-0" : "h-11 px-2 pr-2.5",
          open && "border-line-strong",
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-[11px] font-semibold tracking-[0.02em] text-primary"
        >
          {tileText || <Globe2 className="size-3.5" />}
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-[1.15]">
              <span className="truncate text-[13.5px] font-semibold text-foreground">
                {title}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">{domain}</span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded/switch:rotate-180"
            />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        role="dialog"
        aria-label="Switch website"
        className="w-[392px] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-muted-foreground">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <input
            ref={inputRef}
            aria-label="Search websites"
            aria-controls={listId}
            aria-activedescendant={highlight >= 0 ? `${listId}-row-${highlight}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Switch site or search by domain"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(event.target.value ? 0 : -1);
            }}
          />
          <kbd className="rounded-[5px] border border-border px-1.5 py-px font-sans text-[10.5px] text-muted-foreground">
            ⌘⇧S
          </kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Websites"
          className="max-h-[min(60vh,440px)] overflow-y-auto py-1"
        >
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              No websites match “{query.trim()}”.
            </p>
          )}
          {sections.map((section) => (
            <div key={section.key}>
              {section.kind !== "folded" && (
                <div className="flex items-center gap-2 px-3.5 pb-1 pt-2.5">
                  {section.kind === "recent" ? (
                    <span className="eyebrow">Recent</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-ink-2">
                      {section.title.split(" › ").map((part, index) => (
                        <span key={part} className="flex items-center gap-1">
                          {index > 0 && (
                            <ChevronRight
                              aria-hidden="true"
                              className="size-3 text-line-strong"
                            />
                          )}
                          {part}
                        </span>
                      ))}
                    </span>
                  )}
                  {section.kind === "group" && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {section.websites.length === 0
                        ? "no sites"
                        : `${section.websites.length} ${section.websites.length === 1 ? "site" : "sites"}`}
                    </span>
                  )}
                </div>
              )}
              {section.kind === "folded"
                ? (() => {
                    rowIndex += 1;
                    const index = rowIndex;
                    const row = rows[index];
                    return (
                      <button
                        type="button"
                        id={`${listId}-row-${index}`}
                        role="option"
                        aria-selected={false}
                        data-highlighted={highlight === index || undefined}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => row && activate(row)}
                        className="mx-1.5 my-0.5 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-ink-2 hover:bg-surface-2 data-highlighted:bg-surface-2"
                      >
                        <span className="grid size-7 place-items-center rounded-lg border border-dashed border-line-strong">
                          <ChevronRight aria-hidden="true" className="size-3.5" />
                        </span>
                        <span className="flex min-w-0 flex-col leading-[1.15]">
                          <span className="truncate text-[13px] font-medium">
                            {section.title}
                          </span>
                          <span className="truncate text-[11.5px] text-muted-foreground">
                            {section.summary}
                          </span>
                        </span>
                      </button>
                    );
                  })()
                : section.websites.length === 0 && section.businessId
                  ? (() => {
                      rowIndex += 1;
                      const index = rowIndex;
                      const row = rows[index];
                      const isCurrent =
                        !selectedWebsiteId && section.businessId === shell.selection.businessId;
                      return (
                        <button
                          type="button"
                          id={`${listId}-row-${index}`}
                          role="option"
                          aria-selected={isCurrent}
                          data-highlighted={highlight === index || undefined}
                          onMouseEnter={() => setHighlight(index)}
                          onClick={() => row && activate(row)}
                          className={cn(
                            "mx-1.5 my-0.5 grid w-[calc(100%-0.75rem)] grid-cols-[28px_minmax(0,1fr)_18px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                            "hover:bg-surface-2 data-highlighted:bg-primary-soft",
                            isCurrent && "bg-surface-2",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-7 place-items-center rounded-lg border border-dashed border-line-strong text-[11px] font-semibold text-ink-2"
                          >
                            {initialsFor(section.businessName ?? "")}
                          </span>
                          <span className="flex min-w-0 flex-col leading-[1.15]">
                            <span className="truncate text-[13px] font-semibold text-foreground">
                              {section.businessName}
                            </span>
                            <span className="truncate text-[11.5px] text-muted-foreground">
                              No websites yet · open this business
                            </span>
                          </span>
                          <span className="text-primary">{isCurrent ? "•" : ""}</span>
                        </button>
                      );
                    })()
                : section.websites.map((website) => {
                    rowIndex += 1;
                    const index = rowIndex;
                    const row = rows[index];
                    const isCurrent = website.websiteId === selectedWebsiteId;
                    const websiteEnvironments = environmentsForWebsite(
                      environments,
                      website.websiteId,
                    );
                    return (
                      <button
                        type="button"
                        key={`${section.key}:${website.websiteId}`}
                        id={`${listId}-row-${index}`}
                        role="option"
                        aria-selected={isCurrent}
                        data-highlighted={highlight === index || undefined}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => row && activate(row)}
                        className={cn(
                          "mx-1.5 my-0.5 grid w-[calc(100%-0.75rem)] grid-cols-[28px_minmax(0,1fr)_auto_18px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                          "hover:bg-surface-2 data-highlighted:bg-primary-soft",
                          isCurrent && "bg-surface-2",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-7 place-items-center rounded-lg border text-[11px] font-semibold",
                            isCurrent
                              ? "border-transparent bg-primary-soft text-primary"
                              : "border-border bg-surface-2 text-ink-2",
                          )}
                        >
                          {initialsFor(website.title)}
                        </span>
                        <span className="flex min-w-0 flex-col leading-[1.15]">
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {website.title}
                          </span>
                          <span className="truncate text-[11.5px] text-muted-foreground">
                            {website.primaryDomain}
                          </span>
                        </span>
                        <span
                          className="flex items-center gap-1"
                          aria-label={
                            websiteEnvironments.length
                              ? `${websiteEnvironments.length} environments`
                              : "No environments"
                          }
                        >
                          {websiteEnvironments.slice(0, 4).map((environment) => (
                            <HealthDot key={environment.instanceId} environment={environment} />
                          ))}
                        </span>
                        <span className="text-primary">
                          {isCurrent && (
                            <svg
                              aria-hidden="true"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 12.5l4.5 4.5L19 7" />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 text-[12px] text-muted-foreground">
          {canManage && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-foreground"
              onClick={() => {
                close();
                shell.setOpenPanel("manager");
              }}
            >
              <Globe2 aria-hidden="true" className="size-3.5" />
              Manage sites
            </button>
          )}
          <span className="ml-auto hidden items-center gap-2.5 sm:flex">
            <span>
              <kbd className="mr-1 rounded border border-border px-1 text-[10.5px]">↑↓</kbd>move
            </span>
            <span>
              <kbd className="mr-1 rounded border border-border px-1 text-[10.5px]">↵</kbd>open
            </span>
            <span>
              <kbd className="mr-1 rounded border border-border px-1 text-[10.5px]">esc</kbd>close
            </span>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
