import { defineDataBlock } from "./model";
import * as P from "../primitives";
import "../../../../../../../blocks/commerce/category-tiles/render.css";
export default defineDataBlock("commerce/category-tiles", "commerce.categoryTiles", ({ attrs, data, treatment }) => (
  <div className="cp-category-tiles" data-original-columns={treatment?.values.columns} data-category-state={data.state !== "ready" ? data.state : data.items.length ? "ready" : "empty"} aria-busy={data.state !== "ready"}>
    {(attrs.eyebrow || attrs.heading || attrs.intro) && <header className="cp-category-intro">
      <div>{attrs.eyebrow && <P.Eyebrow>{attrs.eyebrow}</P.Eyebrow>}{attrs.heading && <P.Heading>{attrs.heading}</P.Heading>}</div>
      {attrs.intro && <P.Text tone="muted">{attrs.intro}</P.Text>}
    </header>}
    {data.state === "discovering" ? <p role="status">Finding your collections…</p> : data.items.length ? <ul className="cp-category-grid" aria-label="Shop categories">
      {data.items.map((category, index) => <li key={category.id}>
        <a className="cp-category-tile" href={category.href}>
          <div className="cp-category-image" aria-hidden="true">
            {category.image ? <img src={category.image.src} alt="" loading="lazy" decoding="async" /> : <span className="cp-category-monogram">{category.name.trim().slice(0, 1)}</span>}
            <span className="cp-category-index">{String(index + 1).padStart(2, "0")}</span><span className="cp-category-arrow">↗</span>
          </div>
          <div className="cp-category-caption"><P.Heading level={3} size="md">{category.name}</P.Heading>
            {attrs.showCounts && category.productCount !== null && <span className="cp-category-count">{category.productCount.toLocaleString("en-US")} {category.productCount === 1 ? "product" : "products"}</span>}
          </div>
          {attrs.showDescriptions && category.description && <P.Text size="sm" tone="muted">{category.description}</P.Text>}
        </a>
      </li>)}
    </ul> : <div className="cp-category-empty"><P.Heading level={3} size="md">A collection in the making.</P.Heading><P.Text tone="muted">New shop categories will appear here as they become available.</P.Text><P.Link href="/products" label="Explore the shop" /></div>}
    {data.state === "counting" && <p role="status" className="cp-category-count">Updating product counts…</p>}
    {attrs.ctaLabel && attrs.ctaUrl && <footer className="cp-category-footer"><P.Link href={attrs.ctaUrl} label={attrs.ctaLabel} /></footer>}
  </div>
));
