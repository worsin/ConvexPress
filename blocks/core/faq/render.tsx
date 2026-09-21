import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
export default defineBlock("core/faq",({attrs})=><P.Stack gap="lg"><Intro {...attrs}/><P.Accordion multiple label={attrs.heading||"Frequently asked questions"} items={attrs.items.map((item,index)=>({id:`question-${index}`,title:item.question||`Question ${index+1}`,body:item.answer}))}/></P.Stack>);
