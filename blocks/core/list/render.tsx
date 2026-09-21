import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
export default defineBlock("core/list", ({attrs}) => {
 const Tag=attrs.style === "ordered" ? "ol" : "ul";
 return <Tag className="cp-block-list" data-list-kind={attrs.style}>{attrs.items.map((item,index)=><li key={index}>{attrs.style === "task" && <span className="cp-block-task-state" role="img" aria-label={item.done ? "Completed" : "Not completed"}><P.Icon name={item.done ? "check" : "minus"} /></span>}<P.RichText content={item.text} inline /></li>)}</Tag>;
});
