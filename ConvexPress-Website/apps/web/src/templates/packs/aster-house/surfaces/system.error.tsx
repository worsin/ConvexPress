/**
 * Aster · system.error — centred display headline, one sentence, one
 * retry. Same behaviour as Core: "Try again" calls the boundary's reset or
 * invalidates the router; a plain anchor home survives a broken router; the
 * stack shows in development only.
 */
import { useRouter } from "@tanstack/react-router";

import type { ErrorSurfaceData } from "@/templates/packs/core/surfaces/system.error";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, Eyebrow, buttonClasses } from "../parts";

export default function AsterSystemError({ data }: SurfaceProps<ErrorSurfaceData>) {
  const { error, reset } = data;
  const router = useRouter();
  const isDev = import.meta.env.DEV;

  function retry() {
    if (reset) reset();
    else router.invalidate();
  }

  return (
    <Container data-slot="error-page" className="flex min-h-[50vh] flex-col items-center justify-center py-14 text-center md:py-20">
      <Eyebrow>Error</Eyebrow>
      <h1 className="mt-4 font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-6xl">Something went wrong.</h1>
      <p className="mt-5 max-w-[48ch] text-base leading-8 text-muted-foreground md:text-[17px]">We ran into an unexpected error. Try again, or return to the front page.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" onClick={retry}>
          Try again
        </Button>
        <a href="/" className={buttonClasses("ghost")}>
          Go home
        </a>
      </div>
      {isDev ? (
        <details className="mt-12 w-full max-w-2xl text-left">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">Error details (development only)</summary>
          <pre className="mt-3 overflow-auto rounded-xl bg-muted p-4 text-xs leading-5 text-destructive">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : null}
          </pre>
        </details>
      ) : null}
    </Container>
  );
}
