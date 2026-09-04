/**
 * Journal · system.notFound — centred display headline, one sentence, one
 * link. The in-layout variant also logs the hit for the admin's 404 report
 * and offers a quiet search line, as Core does.
 */
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { useLogNotFound } from "@/hooks/useLogNotFound";
import type { NotFoundSurfaceData } from "@/templates/packs/core/surfaces/system.notFound";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, Eyebrow, LinkButton, UnderlineInput } from "../parts";

export default function JournalSystemNotFound({ data }: SurfaceProps<NotFoundSurfaceData>) {
  const inLayout = data.kind === "page";
  useLogNotFound(inLayout);

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-14 text-center md:py-20" data-slot="not-found-page">
      <Eyebrow>404</Eyebrow>
      <h1 className="mt-4 font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">This page has gone missing.</h1>
      <p className="mt-5 max-w-[48ch] text-base leading-8 text-muted-foreground md:text-[17px]">
        It may have been moved, renamed, or never existed. Try the front page, or search for what you came for.
      </p>
      <div className="mt-8">
        <LinkButton to="/" variant="primary">
          Back to the front page
        </LinkButton>
      </div>
      {inLayout ? <QuietSearch /> : null}
    </Container>
  );
}

function QuietSearch() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    void navigate({ to: "/search", search: { q: trimmed } } as any);
  }
  return (
    <form onSubmit={onSubmit} role="search" aria-label="Search the site" className="mt-12 flex w-full max-w-sm items-end gap-4">
      <label className="min-w-0 flex-1 text-left">
        <span className="sr-only">Search query</span>
        <UnderlineInput type="search" placeholder="Search the site…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="submit" className="h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground">
        Search
      </button>
    </form>
  );
}
