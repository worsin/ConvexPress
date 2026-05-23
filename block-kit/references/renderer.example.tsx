import type { BlockRendererProps } from "../../ConvexPress-Website/apps/web/src/lib/blocks/types";
import type { ExampleAttrs } from "./manifest.example";

export function ExampleRenderer({ attrs }: BlockRendererProps<ExampleAttrs>) {
  return (
    <section className="space-y-3">
      {attrs.eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {attrs.eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl font-semibold">{attrs.heading}</h2>
      <p className="text-muted-foreground">{attrs.body}</p>
    </section>
  );
}

