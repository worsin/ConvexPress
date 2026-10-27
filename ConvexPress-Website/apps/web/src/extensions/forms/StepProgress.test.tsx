import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StepProgress } from "./StepProgress";
import type { WizardStep } from "./wizardSteps";

const steps: WizardStep[] = Array.from({ length: 7 }, (_, index) => ({ index, title: `Step ${index + 1}`, fieldKeys: [], isSkippable: false }));

test("the step list can shrink to a phone's width: its items and connectors give way before it overflows", () => {
  const html = renderToStaticMarkup(createElement(StepProgress, { activeSteps: steps, currentIndex: 0, furthestIndex: 0 }));
  expect(html).toContain('<ol class="flex min-w-0 items-center gap-0.5 sm:gap-1.5">');
  expect(html.match(/<li class="flex min-w-0 shrink items-center gap-1 last:shrink-0 sm:gap-1.5"/g)?.length).toBe(7);
  // Six connectors, each with a floor so a step never touches the next.
  expect(html.match(/h-px w-4 min-w-1 shrink sm:w-8/g)?.length).toBe(6);
  expect(html).toContain('aria-valuetext="Step 1 of 7"');
});
