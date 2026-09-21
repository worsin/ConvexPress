import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/callout",({attrs})=><aside aria-label={attrs.title||attrs.kind}><P.Card tone="muted"><P.Stack gap="md"><P.Eyebrow>{attrs.kind}</P.Eyebrow>{attrs.title&&<P.Heading level={3} size="md">{attrs.title}</P.Heading>}{attrs.body&&<P.RichText content={attrs.body}/>}</P.Stack></P.Card></aside>);
