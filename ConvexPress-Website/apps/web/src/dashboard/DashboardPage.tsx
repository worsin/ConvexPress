/**
 * Renders one registry page module by id. Used by the thin route wrappers
 * under routes/dashboard/ and by the configurable-base-path host, so both
 * paths render exactly the same module tree.
 */

import { CircleDashed } from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { getPageModule } from "./registry";

interface DashboardPageProps {
  id: string;
  /** Remainder after the page's own path, e.g. "/ORD-1". */
  subpath?: string;
}

export function DashboardPage({ id, subpath = "" }: DashboardPageProps) {
  const module = getPageModule(id);
  if (!module) return <PageUnavailable id={id} />;
  if (module.matchSubpath && !module.matchSubpath(subpath)) return <NotFoundPage />;
  const Page = module.Page;
  return <Page subpath={subpath} />;
}

/**
 * Shown when the registry lists a page this site has no module for (for
 * example an extension that registered a page but has not shipped its website
 * half yet). Keeps navigation honest without crashing the shell.
 */
export function PageUnavailable({ id }: { id: string }) {
  return (
    <section
      data-slot="dashboard-page-unavailable"
      className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
      aria-labelledby="page-unavailable-title"
    >
      <CircleDashed className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 id="page-unavailable-title" className="text-sm font-medium text-foreground">
        This page is not available yet
      </h1>
      <p className="text-xs text-muted-foreground">
        The <code className="rounded-none bg-muted px-1 py-0.5 text-[11px]">{id}</code> page is
        registered for this site but has no website module. Add
        <code className="mx-1 rounded-none bg-muted px-1 py-0.5 text-[11px]">dashboard/pages/{id}/manifest.tsx</code>
        to enable it.
      </p>
    </section>
  );
}
