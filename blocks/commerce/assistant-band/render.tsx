import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, Action } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import { useShoppingAssistant, assistantQuestionUrl } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/shopping-assistant";
import "./render.css";

export default defineBlock("commerce/assistant-band", ({ attrs }) => {
  const host = useShoppingAssistant();
  const action = <Action label={attrs.ctaLabel} href={attrs.ctaUrl} />;
  if (!host?.enabled || !host.catalogEnabled) return action;

  // Preserve all eight authored questions. Bound public defaults before creating URLs.
  const prompts = attrs.prompts.length ? attrs.prompts : host.starterPrompts
    .filter((prompt) => typeof prompt === "string" && prompt.trim().length > 0 && prompt.length <= 160)
    .slice(0, 8);
  const intro = <P.Stack gap="lg">
    <Intro eyebrow={attrs.eyebrow || host.displayName} heading={attrs.heading} body={attrs.body || host.tagline} />
    {action}
  </P.Stack>;

  return <div className="cp-assistant-band" data-mobile-available={host.mobileAvailable}>
    <div className="cp-assistant-content">
      {prompts.length ? <P.Split ratio="equal" gap="lg" align="start">
        {intro}
        <div className="cp-assistant-questions">
          <ol aria-label="Questions for the shopping assistant">
            {prompts.map((prompt, index) => <li key={index}>
              <a href={assistantQuestionUrl(prompt)}>
                <span className="cp-assistant-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span>{prompt}</span>
                <span className="cp-assistant-arrow" aria-hidden="true">↗</span>
              </a>
            </li>)}
          </ol>
        </div>
      </P.Split> : intro}
    </div>
    {!host.mobileAvailable && <div className="cp-assistant-mobile-fallback">{action}</div>}
  </div>;
});
