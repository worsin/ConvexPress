import { defineBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";
import { Children } from "react";
export default defineBlock("core/list", ({attrs, children}) => {
 const Tag=attrs.style === "ordered" ? "ol" : "ul";
 return <Tag className="cp-block-list" data-list-kind={attrs.style}>{attrs.items.map((item,index)=><li key={`text-${index}`}>{attrs.style === "task" && <span className="cp-block-task-state" role="img" aria-label={item.done ? "Completed" : "Not completed"}><P.Icon name={item.done ? "check" : "minus"} /></span>}<P.RichText content={item.text} inline /></li>)}{Children.toArray(children).map((child, index) => <li key={`block-${index}`} className="cp-block-list-item">{attrs.style === "task" && <span className="cp-block-task-state" role="img" aria-label="Not completed"><P.Icon name="minus" /></span>}<div className="cp-block-list-item-body">{child}</div></li>)}</Tag>;
});
