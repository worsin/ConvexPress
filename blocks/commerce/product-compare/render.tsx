import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { comparisonRowDiffers } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/portable/productCompareContracts";
import { observeSectionReveal } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives/reveal";
import { formatMoney } from "../../../ConvexPress-Website/apps/web/src/lib/commerce/format";
import * as P from "../../../ConvexPress-Website/apps/web/src/templates/sdk/primitives";
import "./render.css";

export default defineDataBlock("commerce/product-compare", "commerce.productCompare", ({ attrs, data }) => {
  const root = useRef<HTMLDivElement>(null), id = useId();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  useEffect(() => root.current ? observeSectionReveal(root.current) : undefined, []);
  const rows = differencesOnly ? data.rows.filter(comparisonRowDiffers) : data.rows;
  return <div className="cp-compare" ref={root}>
    <header className="cp-compare-header">
      <P.Stack gap="sm"><P.Eyebrow>A closer look</P.Eyebrow><P.Heading level={2} size="lg">Find your favorite.</P.Heading>
        <P.Text tone="muted">The details, side by side.</P.Text></P.Stack>
      {data.items.length > 1 && <label className="cp-compare-toggle"><input type="checkbox" checked={differencesOnly} onChange={event => setDifferencesOnly(event.target.checked)}/><span>Only show differences</span></label>}
    </header>
    {!data.items.length ? <P.Text tone="muted">{attrs.products.length ? "These products are not available right now." : "Choose products to compare their details."}</P.Text> : <>
      <p className="cp-compare-hint" id={`${id}-hint`}>Scroll sideways to explore every product. <span aria-hidden="true">↔</span></p>
      <div className="cp-compare-scroll" role="region" aria-label="Product comparison" aria-describedby={`${id}-hint`} tabIndex={0}>
        <table className="cp-compare-table" style={{ "--cp-compare-count": data.items.length } as CSSProperties}>
          <caption className="cp-compare-sr">Compare {data.items.map(item => item.title).join(", ")}</caption>
          <thead><tr><td className="cp-compare-corner"><span>{String(data.items.length).padStart(2, "0")}</span><span>{data.items.length === 1 ? "product" : "products"}<br/>in focus</span></td>
            {data.items.map((item, index) => <th scope="col" key={item.id}>
              <a className="cp-compare-photo" href={item.href} aria-label={`View ${item.title}`}>
                {item.image ? <img src={item.image.src} alt={item.image.alt} loading="lazy" decoding="async"/> : <span aria-hidden="true" className="cp-compare-monogram">{Array.from(item.title.trim())[0] || "✳"}</span>}
                <span className="cp-compare-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </a>
              <a className="cp-compare-title" href={item.href}>{item.title}<span aria-hidden="true">↗</span></a>
            </th>)}
          </tr></thead>
          <tbody>
            <tr className="cp-compare-price"><th scope="row">Price</th>{data.items.map(item => <td key={item.id}>{item.price ? <>
              {formatMoney(item.price.min, item.price.currencyCode)}{item.price.min !== item.price.max && <> – {formatMoney(item.price.max, item.price.currencyCode)}<span className="cp-compare-price-note">Across available options</span></>}
            </> : "Not specified"}</td>)}</tr>
            {rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th>{row.cells.map((cell, index) => <td key={data.items[index]!.id}>{cell ? <ul className="cp-compare-values">{cell.map(value => <li key={value}>{value}</li>)}</ul> : <span className="cp-compare-missing">Not specified</span>}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <p className="cp-compare-footnote" role="status">{differencesOnly && !rows.length ? "These products share the same listed details." : `${rows.length} ${rows.length === 1 ? "detail" : "details"} shown. Visit a product for availability and more information.`}</p>
    </>}
  </div>;
});
