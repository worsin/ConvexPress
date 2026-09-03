/**
 * AuthScreen — the shared sign-in / setup layout.
 *
 * A brand panel on the left (headline, three steps, watermark) and a card on
 * the right that hosts whatever form the caller renders. Used by the
 * standalone operator login, the single-site login, and the first-admin
 * setup forms so every entry point to ConvexPress looks like one product.
 */

import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand/BrandLockup";
import { BrandMark } from "@/components/brand/BrandMark";
import { ThemeSegment } from "@/components/shell/OperatorFooter";
import { isElectron } from "@/lib/electron";
import { cn } from "@/lib/utils";

export interface AuthScreenStep {
  number: string;
  title: string;
  detail: string;
}

const DEFAULT_STEPS: AuthScreenStep[] = [
  { number: "01", title: "Choose a website", detail: "Organizations and businesses stay one click away." },
  { number: "02", title: "Exchange authority", detail: "A short-lived session is minted for that site only." },
  { number: "03", title: "Work in isolation", detail: "Its database, files, and customers never mix with another's." },
];

interface AuthScreenProps {
  /** Small caps line above the headline in the brand panel. */
  panelEyebrow?: ReactNode;
  /** Headline in the brand panel. Serif, large. */
  headline?: ReactNode;
  /** Supporting sentence under the headline. */
  lede?: ReactNode;
  steps?: AuthScreenStep[] | null;
  /** Eyebrow above the card title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Card body — usually a form. */
  children: ReactNode;
  /** Line under the card. */
  footnote?: ReactNode;
  /** Card width class override. */
  cardClassName?: string;
}

export function AuthScreen({
  panelEyebrow = "Standalone control plane",
  headline = (
    <>
      One desk.
      <br />
      Every website.
      <br />
      <em className="text-primary">Nothing</em> shared.
    </>
  ),
  lede = "Manage organizations, businesses, and isolated ConvexPress environments without merging customer accounts or site data.",
  steps = DEFAULT_STEPS,
  eyebrow,
  title,
  description,
  children,
  footnote,
  cardClassName,
}: AuthScreenProps) {
  return (
    <main className="relative grid min-h-svh bg-background text-foreground lg:grid-cols-[1.1fr_minmax(0,0.9fr)]">
      {isElectron() && (
        <div
          className="app-drag pointer-events-none fixed inset-x-0 top-0 z-50 h-8"
          aria-hidden="true"
        />
      )}

      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-12 lg:flex">
        <BrandLockup size={32} />
        <div className="max-w-xl">
          {panelEyebrow && <p className="eyebrow">{panelEyebrow}</p>}
          <h1 className="mt-5 font-serif text-[56px] leading-[1.02] tracking-[-0.015em]">
            {headline}
          </h1>
          {lede && (
            <p className="mt-6 max-w-md text-[15px] leading-7 text-ink-2">{lede}</p>
          )}
        </div>
        {steps && steps.length > 0 ? (
          <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {steps.map((step) => (
              <li key={step.number} className="bg-sidebar p-4">
                <span className="font-mono text-[11px] text-primary">{step.number}</span>
                <span className="mt-2 block text-[13.5px] font-semibold text-foreground">
                  {step.title}
                </span>
                <span className="mt-1 block text-[12.5px] leading-5 text-muted-foreground">
                  {step.detail}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div />
        )}
        <BrandMark
          size={520}
          tone="outline"
          className="pointer-events-none absolute -bottom-40 -right-36 opacity-[0.045]"
        />
      </section>

      {/* Card */}
      <section className="flex flex-col p-5 sm:p-8">
        <div className="flex items-center justify-between lg:justify-end">
          <BrandLockup size={28} className="lg:hidden" />
          <ThemeSegment />
        </div>
        <div className="grid flex-1 place-items-center py-8">
          <div
            className={cn(
              "w-full max-w-[400px] rounded-2xl border border-border bg-card p-7 shadow-soft sm:p-8",
              cardClassName,
            )}
          >
            {eyebrow && <p className="eyebrow text-primary">{eyebrow}</p>}
            <h2 className="mt-2.5 font-serif text-[34px] leading-none tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <p className="mt-3 text-[13px] leading-6 text-ink-2">{description}</p>
            )}
            {children}
          </div>
        </div>
        {footnote && (
          <p className="text-center text-[12px] text-muted-foreground lg:text-right">
            {footnote}
          </p>
        )}
      </section>
    </main>
  );
}

/** Inline error used by every auth form. */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-5 rounded-lg border border-destructive/30 bg-live-soft px-3 py-2.5 text-[13px] leading-5 text-destructive"
    >
      {children}
    </p>
  );
}
