import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { Icon } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/menu.css";

export default defineDataBlock("core/menu", "site.menu", ({ data }) => {
  if (!data.menu || !data.items.length) return null;
  const children = (parent: string | null) => data.items.filter(item => item.parentId === parent);
  const list = (parent: string | null) => <ul>
    {children(parent).map(item => <li key={item.id} data-kind={item.kind}>
      {item.kind === "separator" ? <hr /> : item.kind === "heading" ?
        <span className="cp-inline-menu-heading">{item.label}</span> :
        <a href={item.href!} target={item.target} rel={item.rel ?? undefined}>
          <span className="cp-inline-menu-copy"><span className="cp-inline-menu-label">{item.label}</span>
            {item.description && <span className="cp-inline-menu-description">{item.description}</span>}
          </span>
          <Icon name={item.target === "_blank" ? "arrow-up-right" : "arrow-right"} size="sm" />
          {item.target === "_blank" && <span className="cp-inline-menu-sr"> (opens in a new tab)</span>}
        </a>}
      {children(item.id).length > 0 && list(item.id)}
    </li>)}
  </ul>;
  return <nav className="cp-inline-menu" aria-label={data.menu.name}>
    <p className="cp-inline-menu-caption">{data.menu.name}</p>
    {list(null)}
  </nav>;
});
