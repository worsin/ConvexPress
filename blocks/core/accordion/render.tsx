import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { Intro } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/presentation";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineBlock("core/accordion",({attrs})=><div className="cp-canonical-disclosure"><P.Stack gap="lg"><Intro heading={attrs.heading} body={attrs.body}/><P.Accordion multiple defaultOpenId={Number.isInteger(attrs.defaultOpen)&&attrs.defaultOpen<attrs.items.length ? `item-${attrs.defaultOpen}` : undefined} items={attrs.items.map((item,index)=>({id:`item-${index}`,title:item.title||`Details ${index+1}`,body:item.body}))}/></P.Stack></div>);
