import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/rich-text", ({attrs}) => <P.Stack gap="lg"><Intro eyebrow={attrs.eyebrow} heading={attrs.heading} /><P.RichText content={attrs.body} /></P.Stack>);
