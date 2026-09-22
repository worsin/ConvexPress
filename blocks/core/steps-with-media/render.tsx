import { useEffect, useRef, useState } from "react";
import { defineBlock, type BlockProps } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { ResolvedImage, CardCopy } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import "./steps.css";
import { StageMedia } from "./stage-media";

function StepsWithMedia({ attrs, resources }: BlockProps<"core/steps-with-media">) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.IntersectionObserver || !window.ResizeObserver || !attrs.steps.some(step => step.media)) return;
    const motion = window.matchMedia('(min-height:42rem) and (prefers-reduced-motion:no-preference)');
    let observer: IntersectionObserver | undefined;
    let enabled = false;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.cp-library-scroll-copy > li'));
    const configure = () => {
      observer?.disconnect();
      enabled = motion.matches && root.clientWidth >= 768;
      setEnhanced(enabled);
      if (!enabled) return;
      // Observe a reading band, not image intersections; long text remains one step.
      const intersecting = new Set<number>();
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const index = rows.indexOf(entry.target as HTMLElement);
          if (entry.isIntersecting) intersecting.add(index);
          else intersecting.delete(index);
        }
        // Entries are changes, not the complete visible set (especially scrolling back).
        if (intersecting.size) setActive(Math.max(...intersecting));
      }, { rootMargin: `-${Math.floor(window.innerHeight * .25)}px 0px -${Math.floor(window.innerHeight * .65)}px 0px`, threshold: 0 });
      rows.forEach(row => observer!.observe(row));
    };
    const focus = (event: FocusEvent) => {
      if (!enabled || !(event.target instanceof Element)) return;
      const row = event.target.closest<HTMLElement>('.cp-library-scroll-copy > li');
      if (row && rows.includes(row)) setActive(rows.indexOf(row));
    };
    const resize = new ResizeObserver(configure);
    resize.observe(root);
    motion.addEventListener('change', configure);
    window.addEventListener('resize', configure);
    root.addEventListener('focusin', focus);
    configure();
    return () => {
      observer?.disconnect(); resize.disconnect();
      motion.removeEventListener('change', configure);
      window.removeEventListener('resize', configure);
      root.removeEventListener('focusin', focus);
    };
  }, [attrs.steps]);
  const current = Math.min(active, Math.max(0, attrs.steps.length - 1));
  // Without media or browser observers the original readable sequence stays intact.
  const ready = enhanced && attrs.steps.some(step => step.media);
  return (
    <div ref={rootRef} className="cp-library-scroll-steps" data-enhanced={ready} data-active-step={current}>
      <ol className="cp-library-scroll-copy" role="list">
        {attrs.steps.map((step, index) => (
          <li key={index} data-current={index === current}>
            <CardCopy><P.Stack gap="md">
              <P.Eyebrow>{String(index + 1).padStart(2, "0")}</P.Eyebrow>
              <P.Heading level={3} size="lg">{step.title}</P.Heading>
              {step.body && <P.RichText content={step.body} />}
            </P.Stack></CardCopy>
            {step.media && <div className="cp-library-scroll-inline"><ResolvedImage {...step.media} resources={resources} /></div>}
          </li>
        ))}
      </ol>
      <div className="cp-library-scroll-stage" aria-hidden="true">
        <div className="cp-library-scroll-pin">
          {attrs.steps.map((step, index) => (
            <div key={index} data-step={index} data-current={index === current}>
              <StageMedia step={step} index={index} resources={resources} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export default defineBlock("core/steps-with-media", StepsWithMedia);
