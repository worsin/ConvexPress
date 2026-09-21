/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro, Action } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/cta-band", ({ attrs }) => (<P.Stack gap="lg"><Intro {...attrs} /><P.Stack direction="horizontal" gap="md" wrap><Action label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} /><Action variant="outline" label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} /></P.Stack></P.Stack>));
