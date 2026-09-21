/** Staged Library treatment; legacy content activation requires separate acceptance. */
import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import { Prose, Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
export default defineBlock("core/process-steps", ({ attrs }) => (<P.Stack gap="lg"><Intro {...attrs} /><P.Grid columns={{base:1,md:2,lg:3}} gap="lg">{attrs.steps.map((item,index)=><P.Card key={index}><P.Stack gap="md"><P.Eyebrow>{String(index+1).padStart(2,"0")}</P.Eyebrow>{item.title && <P.Heading level={3} size="md">{item.title}</P.Heading>}{item.body && <Prose text={item.body} />}</P.Stack></P.Card>)}</P.Grid></P.Stack>));
