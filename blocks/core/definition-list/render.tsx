import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineBlock("core/definition-list",({attrs})=><dl className="cp-canonical-definitions">{attrs.items.map((item,index)=><div key={index}><dt>{item.term}</dt><dd>{item.definition&&<P.RichText content={item.definition}/>}</dd></div>)}</dl>);
