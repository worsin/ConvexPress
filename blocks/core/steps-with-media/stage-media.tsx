import { useEffect, useRef, useState } from "react";
import type { BlockProps } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { ResolvedImage } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";

type Step = BlockProps<"core/steps-with-media">["attrs"]["steps"][number];
type State = "loading" | "ready" | "error";

/** The pinned visual copy never fades a not-yet-decoded image into an empty frame. */
export function StageMedia({ step, index, resources }: {
  step: Step;
  index: number;
  resources: BlockProps<"core/steps-with-media">["resources"];
}) {
  const root = useRef<HTMLDivElement>(null);
  const source = step.media ? `${step.media.id}\n${resources.media[step.media.id]?.src ?? ""}` : "";
  const [result, setResult] = useState<{ source: string; state: State }>({ source: "", state: "loading" });
  const state = result.source === source ? result.state : "loading";
  useEffect(() => {
    const image = root.current?.querySelector("img");
    if (!image) return;
    let disposed = false;
    const fail = () => { if (!disposed) setResult({ source, state: "error" }); };
    const loaded = () => {
      // decode can finish after the editor replaces the source or removes the step.
      const decoded = typeof image.decode === "function" ? image.decode() : Promise.resolve();
      void decoded.then(() => {
        if (!disposed) setResult({ source, state: image.naturalWidth > 0 ? "ready" : "error" });
      }, fail);
    };
    image.addEventListener("load", loaded);
    image.addEventListener("error", fail);
    if (image.complete) {
      if (image.naturalWidth > 0) loaded(); else fail();
    }
    return () => {
      disposed = true;
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", fail);
    };
  }, [source]);
  return (
    <div ref={root} className="cp-library-scroll-visual" data-media-state={step.media ? state : "absent"}>
      <div className="cp-library-scroll-pause">
        <P.Eyebrow>{String(index + 1).padStart(2, "0")}</P.Eyebrow>
        <P.Text>{step.title}</P.Text>
        {step.media && state === "error" && <P.Text size="sm" tone="muted">Image unavailable</P.Text>}
      </div>
      {step.media && <div className="cp-library-scroll-image"><ResolvedImage {...step.media} resources={resources} /></div>}
    </div>
  );
}
