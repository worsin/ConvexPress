import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { sampleAlertAttrsSchema, type SampleAlertAttrs } from "./schema";

function SampleAlertRenderer({ attrs }: BlockRendererProps<SampleAlertAttrs>) {
  return (
    <aside
      data-alert-variant={attrs.variant}
      className="border border-border bg-card p-5"
    >
      <h2 className="text-lg font-semibold text-foreground">{attrs.heading}</h2>
      {attrs.body && (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{attrs.body}</p>
      )}
      {attrs.ctaLabel && attrs.ctaUrl && (
        <a
          href={attrs.ctaUrl}
          className="mt-4 inline-flex min-h-10 items-center border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted"
        >
          {attrs.ctaLabel}
        </a>
      )}
    </aside>
  );
}

export const definition = {
  name: "local/sample-alert",
  title: "Sample Alert",
  version: 1,
  schema: sampleAlertAttrsSchema,
  Renderer: SampleAlertRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
