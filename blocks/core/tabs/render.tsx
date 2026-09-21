import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineBlock("core/tabs",({attrs})=><div className="cp-canonical-tabs"><P.Stack gap="lg">{attrs.heading&&<P.Heading>{attrs.heading}</P.Heading>}{attrs.tabs.length>0&&<P.Tabs label={attrs.heading||"Content sections"} items={attrs.tabs.map((tab,index)=>({id:`tab-${index}`,title:tab.label||`Section ${index+1}`,body:tab.body}))}/>}</P.Stack></div>);
