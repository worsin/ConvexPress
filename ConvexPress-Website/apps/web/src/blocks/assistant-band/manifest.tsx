/**
 * Shopping Assistant Band — public renderer. Each example question opens the
 * shop with the assistant rail pre-asked. Name and starter prompts come from
 * Settings › Shop assistant when the block leaves them empty.
 */

import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { useAssistantConfig } from "@/hooks/useAssistantConfig";
import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { CtaLink, RichText } from "../_shared/rendering";
import { assistantBandAttrsSchema, type AssistantBandAttrs } from "./schema";

function AssistantBandRenderer({ attrs }: BlockRendererProps<AssistantBandAttrs>) {
  const config = useAssistantConfig();
  const prompts = (attrs.prompts.length ? attrs.prompts : config.starterPrompts).slice(0, 6);
  if (!config.enabled) {
    return attrs.ctaLabel && attrs.ctaUrl ? (
      <div className="flex justify-center">
        <CtaLink label={attrs.ctaLabel} href={attrs.ctaUrl} primary />
      </div>
    ) : null;
  }

  return (
    <section
      data-block="commerce/assistant-band"
      className="grid gap-8 rounded-2xl border border-primary/20 bg-primary/5 p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:p-10"
    >
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
          {attrs.eyebrow || config.displayName}
        </p>
        <h2 className="text-3xl font-semibold leading-tight text-foreground md:text-4xl">{attrs.heading}</h2>
        <RichText text={attrs.body || config.tagline} className="text-muted-foreground" />
        {attrs.ctaLabel && attrs.ctaUrl && (
          <div className="pt-2">
            <CtaLink label={attrs.ctaLabel} href={attrs.ctaUrl} primary />
          </div>
        )}
      </div>
      <ul className="grid gap-2">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <Link
              to="/products"
              search={{ ask: prompt } as any}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <span>{prompt}</span>
              <span aria-hidden="true" className="text-primary">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const definition = {
  name: "commerce/assistant-band",
  title: "Shopping Assistant Band",
  version: 1,
  schema: assistantBandAttrsSchema,
  Renderer: AssistantBandRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
