/**
 * Renders the dashboard for a base-relative remainder ("" or "/orders/1"):
 * resolves the registry page, then renders its module through the shell.
 * Shared by routes/$.tsx (multi-segment base paths) and
 * routes/_marketing/$slug.tsx (single-segment base path root).
 */

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";
import { DashboardPage } from "./DashboardPage";
import { DashboardShell } from "./DashboardShell";
import { resolvePageFromRemainder } from "./nav";
import { useDashboardRegistry } from "./shell/useDashboardNav";

export function DashboardPathHost({ remainder }: { remainder: string }) {
  return (
    <DashboardShell>
      <PathPage remainder={remainder} />
    </DashboardShell>
  );
}

function PathPage({ remainder }: { remainder: string }) {
  const registry = useDashboardRegistry();
  const { config } = useDashboardConfig();
  if (!registry) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const match = resolvePageFromRemainder(remainder, registry.pages, config.landingPage);
  if (!match) return <NotFoundPage />;
  return <DashboardPage id={match.page.id} subpath={match.subpath} />;
}
