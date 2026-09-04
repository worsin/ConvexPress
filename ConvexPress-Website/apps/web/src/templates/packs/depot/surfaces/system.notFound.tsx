/**
 * Depot · system.notFound — a card centred on a muted band. `kind: "page"`
 * (inside the marketing chrome) keeps Core's search form and logs the hit for
 * the admin's 404 report; `kind: "root"` is the bare screen with one action.
 */
import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import type { ReactNode } from "react";

import { SearchForm } from "@/components/blog/SearchForm";
import { useLogNotFound } from "@/hooks/useLogNotFound";
import type { NotFoundSurfaceData } from "@/templates/packs/core/surfaces/system.notFound";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Label, buttonClasses } from "../parts";

export default function DepotNotFound({ data }: SurfaceProps<NotFoundSurfaceData>) {
  if (data.kind === "root") return <RootNotFound />;
  return <PageNotFound />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div data-slot="not-found-page" className="flex min-h-[50vh] w-full items-center justify-center rounded-md bg-muted/40 px-4 py-10">
      <Card className="flex w-full max-w-md flex-col items-center gap-4 p-6 text-center">{children}</Card>
    </div>
  );
}

function RootNotFound() {
  return (
    <Frame>
      <Label>Error 404</Label>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="text-[13px] text-muted-foreground">The page you are looking for could not be found.</p>
      <a href="/" className={buttonClasses("primary")}>
        Return home
      </a>
    </Frame>
  );
}

function PageNotFound() {
  useLogNotFound();
  return (
    <Frame>
      <Label>Error 404</Label>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="text-[13px] leading-5 text-muted-foreground">The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.</p>
      <div className="flex w-full flex-col gap-2 text-left">
        <Label>Try searching for what you need</Label>
        <SearchForm autoFocus />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/" className={buttonClasses("secondary")}>
          <Home className="size-4" aria-hidden="true" />
          Go home
        </Link>
        <Link to="/blog" className={buttonClasses("secondary")}>
          View blog
        </Link>
      </div>
    </Frame>
  );
}
