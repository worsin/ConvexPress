/**
 * Storefront layout presets: what the admin can pick in Settings › Shop layouts.
 *
 * A preset is a page composition, not a colour theme. Each entry carries a
 * wireframe drawn from the admin's own tokens so the picker shows the shape
 * of the page before it is saved. Ids must match the backend's
 * `SHOP_LAYOUT_IDS` / `PRODUCT_LAYOUT_IDS` and the storefront's layouts.
 */

import type { ReactNode } from "react";

export type ShopLayoutId = "boutique" | "marketplace";
export type ProductLayoutId = "classic" | "marketplace" | "split" | "showcase" | "minimal";

export interface LayoutPreset<Id extends string> {
  id: Id;
  name: string;
  tagline: string;
  description: string;
  bestFor: string[];
  features: string[];
  /** Wireframe; `detailed` draws the larger preview-panel version. */
  Wireframe: (props: { detailed?: boolean }) => ReactNode;
}

/* ───────────────────────── wireframe primitives ───────────────────────── */

const ink = "var(--foreground)";
const muted = "var(--muted-foreground)";
const line = "var(--border)";
const accent = "var(--primary)";
const surface = "var(--card)";

function Frame({ children, w = 320, h = 200 }: { children: ReactNode; w?: number; h?: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="img" aria-hidden="true" className="block" style={{ aspectRatio: `${w} / ${h}` }}>
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="8" fill="var(--background)" stroke={line} />
      {children}
    </svg>
  );
}

function Header({ w }: { w: number }) {
  return (
    <>
      <rect x="0" y="0" width={w} height="16" fill={surface} />
      <line x1="0" y1="16.5" x2={w} y2="16.5" stroke={line} />
      <rect x="10" y="6" width="34" height="4" rx="2" fill={ink} opacity="0.9" />
      <rect x="52" y="6" width="14" height="4" rx="2" fill={muted} opacity="0.6" />
      <rect x="70" y="6" width="14" height="4" rx="2" fill={muted} opacity="0.6" />
      <rect x="88" y="6" width="14" height="4" rx="2" fill={muted} opacity="0.6" />
      <circle cx={w - 14} cy="8" r="3" fill={muted} opacity="0.6" />
      <circle cx={w - 26} cy="8" r="3" fill={muted} opacity="0.6" />
    </>
  );
}

function Panel({ x, y, w, h, tone = "card" }: { x: number; y: number; w: number; h: number; tone?: "card" | "accent" | "muted" }) {
  const fill = tone === "accent" ? accent : tone === "muted" ? muted : surface;
  const opacity = tone === "accent" ? 0.12 : tone === "muted" ? 0.16 : 1;
  return <rect x={x} y={y} width={w} height={h} rx="4" fill={fill} opacity={opacity} stroke={tone === "card" ? line : "none"} />;
}

function Lines({ x, y, w, n = 3, gap = 6 }: { x: number; y: number; w: number; n?: number; gap?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <rect key={i} x={x} y={y + i * gap} width={i === n - 1 ? w * 0.6 : w} height="2.5" rx="1.25" fill={muted} opacity="0.55" />
      ))}
    </>
  );
}

function Card({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const img = h * 0.58;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={surface} stroke={line} />
      <rect x={x + 3} y={y + 3} width={w - 6} height={img} rx="2" fill={muted} opacity="0.22" />
      <rect x={x + 4} y={y + img + 7} width={w * 0.7} height="2.5" rx="1.25" fill={ink} opacity="0.7" />
      <rect x={x + 4} y={y + img + 12} width={w * 0.4} height="2.5" rx="1.25" fill={muted} opacity="0.5" />
      <rect x={x + 4} y={y + h - 8} width={w * 0.45} height="4" rx="2" fill={accent} opacity="0.9" />
    </>
  );
}

function Grid({ x, y, w, h, cols, rows, gap = 5 }: { x: number; y: number; w: number; h: number; cols: number; rows: number; gap?: number }) {
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1)) / rows;
  return (
    <>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => <Card key={`${r}-${c}`} x={x + c * (cw + gap)} y={y + r * (ch + gap)} w={cw} h={ch} />),
      )}
    </>
  );
}

function Assistant({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={surface} stroke={line} />
      <circle cx={x + 8} cy={y + 8} r="3.5" fill={accent} opacity="0.9" />
      <rect x={x + 14} y={y + 6.5} width={w * 0.5} height="3" rx="1.5" fill={ink} opacity="0.7" />
      <rect x={x + 4} y={y + 18} width={w - 8} height={h * 0.28} rx="3" fill={accent} opacity="0.12" />
      <Lines x={x + 7} y={y + 22} w={w - 14} n={3} gap={5} />
      <rect x={x + w * 0.3} y={y + h * 0.55} width={w * 0.65} height="8" rx="4" fill={muted} opacity="0.2" />
      <rect x={x + 4} y={y + h - 12} width={w - 8} height="8" rx="3" fill="var(--background)" stroke={line} />
      <rect x={x + w - 14} y={y + h - 10} width="8" height="4" rx="2" fill={accent} />
    </>
  );
}

function Cart({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={surface} stroke={line} />
      <rect x={x + 5} y={y + 6} width={w * 0.5} height="3" rx="1.5" fill={ink} opacity="0.7" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={x + 5} y={y + 16 + i * 16} width="12" height="12" rx="2" fill={muted} opacity="0.25" />
          <rect x={x + 20} y={y + 18 + i * 16} width={w - 28} height="2.5" rx="1.25" fill={muted} opacity="0.55" />
          <rect x={x + 20} y={y + 23 + i * 16} width={(w - 28) * 0.4} height="2.5" rx="1.25" fill={muted} opacity="0.35" />
        </g>
      ))}
      <rect x={x + 5} y={y + h - 12} width={w - 10} height="8" rx="3" fill={accent} opacity="0.95" />
    </>
  );
}

function BuyBox({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={surface} stroke={line} />
      <rect x={x + 6} y={y + 7} width={w * 0.45} height="5" rx="2" fill={ink} opacity="0.85" />
      <rect x={x + 6} y={y + 17} width={w * 0.3} height="3" rx="1.5" fill={accent} opacity="0.8" />
      <rect x={x + 6} y={y + 25} width="14" height="6" rx="3" fill="var(--background)" stroke={line} />
      <rect x={x + 23} y={y + 25} width="14" height="6" rx="3" fill="var(--background)" stroke={line} />
      <rect x={x + 6} y={y + h - 22} width={w - 12} height="8" rx="3" fill={accent} opacity="0.95" />
      <rect x={x + 6} y={y + h - 11} width={w - 12} height="6" rx="3" fill="var(--background)" stroke={line} />
    </>
  );
}

function Photo({ x, y, w, h, hero = false }: { x: number; y: number; w: number; h: number; hero?: boolean }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="4" fill={muted} opacity={hero ? 0.35 : 0.22} />
      <circle cx={x + w * 0.62} cy={y + h * 0.4} r={Math.min(w, h) * 0.16} fill={muted} opacity="0.35" />
      <path d={`M${x + 4} ${y + h - 4} L${x + w * 0.35} ${y + h * 0.55} L${x + w * 0.55} ${y + h * 0.75} L${x + w * 0.75} ${y + h * 0.6} L${x + w - 4} ${y + h - 4} Z`} fill={muted} opacity="0.4" />
    </>
  );
}

function Thumbs({ x, y, n, vertical = false, size = 9 }: { x: number; y: number; n: number; vertical?: boolean; size?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <rect
          key={i}
          x={vertical ? x : x + i * (size + 3)}
          y={vertical ? y + i * (size + 3) : y}
          width={size}
          height={size}
          rx="2"
          fill={muted}
          opacity={i === 0 ? 0.5 : 0.25}
          stroke={i === 0 ? accent : "none"}
        />
      ))}
    </>
  );
}

function Text({ x, y, w, title = true }: { x: number; y: number; w: number; title?: boolean }) {
  return (
    <>
      {title && <rect x={x} y={y} width={w * 0.7} height="6" rx="3" fill={ink} opacity="0.85" />}
      <Lines x={x} y={y + (title ? 11 : 0)} w={w} n={4} gap={5} />
    </>
  );
}

/* ───────────────────────── shop layouts ───────────────────────── */

export const SHOP_LAYOUT_PRESETS: Array<LayoutPreset<ShopLayoutId>> = [
  {
    id: "boutique",
    name: "Boutique",
    tagline: "Fixed width, roomy cards, a filter rail",
    description:
      "A centred page with generous product cards and a filter rail beside the grid. The assistant slides in next to the content and the cart keeps a column on the right.",
    bestFor: ["Small catalogs (a few dozen products) that should not look sparse", "Considered purchases where each product needs room", "Brands that want an editorial feel"],
    features: ["Three-up product grid", "Filter rail with sort, categories and price caps", "Assistant beside the content, left or right", "Persistent cart column on wide screens"],
    Wireframe: ({ detailed }) => {
      const w = 320;
      const h = detailed ? 220 : 200;
      const inner = 236;
      const x0 = (w - inner) / 2;
      return (
        <Frame w={w} h={h}>
          <Header w={w} />
          <Assistant x={x0} y={26} w={56} h={h - 36} />
          <rect x={x0 + 62} y={26} width={30} height="3" rx="1.5" fill={muted} opacity="0.5" />
          <rect x={x0 + 62} y={33} width={110} height="7" rx="3" fill="var(--background)" stroke={line} />
          <rect x={x0 + 62} y={46} width={20} height="2.5" rx="1.25" fill={muted} opacity="0.5" />
          <rect x={x0 + 62} y={52} width={26} height="2.5" rx="1.25" fill={muted} opacity="0.5" />
          <rect x={x0 + 62} y={58} width={22} height="2.5" rx="1.25" fill={muted} opacity="0.5" />
          <Grid x={x0 + 90} y={46} w={inner - 90 - 44} h={h - 56} cols={2} rows={2} />
          <Cart x={x0 + inner - 40} y={26} w={40} h={h - 36} />
        </Frame>
      );
    },
  },
  {
    id: "marketplace",
    name: "Marketplace",
    tagline: "Edge to edge, dense grid, cart always in view",
    description:
      "Uses the whole screen the way a large retailer does: the assistant on the left, a dense product grid with a filter toolbar in the middle, and the cart pinned on the right. Built for scanning many products fast.",
    bestFor: ["Large catalogs where browsing and search speed matter", "Parts, consumables and anything bought by comparison", "Shoppers who add several items per visit"],
    features: ["Four- to five-up grid, fully responsive", "Filter toolbar above the results", "Assistant column on the left, animated open and close", "Persistent cart column with checkout on the right"],
    Wireframe: ({ detailed }) => {
      const w = 320;
      const h = detailed ? 220 : 200;
      return (
        <Frame w={w} h={h}>
          <Header w={w} />
          <Assistant x={8} y={24} w={62} h={h - 32} />
          <rect x={76} y={24} width={40} height="3" rx="1.5" fill={muted} opacity="0.5" />
          <rect x={76} y={31} width={160} height="7" rx="3" fill="var(--background)" stroke={line} />
          <rect x={76} y={42} width={166} height="9" rx="3" fill={surface} stroke={line} />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={80 + i * 22} y={45} width="18" height="3.5" rx="1.75" fill={i === 0 ? accent : muted} opacity={i === 0 ? 0.8 : 0.4} />
          ))}
          <Grid x={76} y={56} w={166} h={h - 64} cols={4} rows={2} gap={4} />
          <Cart x={248} y={24} w={64} h={h - 32} />
        </Frame>
      );
    },
  },
];

/* ───────────────────────── product layouts ───────────────────────── */

export const PRODUCT_LAYOUT_PRESETS: Array<LayoutPreset<ProductLayoutId>> = [
  {
    id: "classic",
    name: "Classic",
    tagline: "Photo beside a detail card",
    description: "The familiar two-column product page: photos on the left, a framed card with price, options and add to cart on the right, description underneath.",
    bestFor: ["Most catalogs", "Products with a few options", "A safe default"],
    features: ["Sticky gallery with thumbnails", "Framed buy card", "Specs as tiles", "Description, related items and reviews below"],
    Wireframe: () => (
      <Frame>
        <Header w={320} />
        <Photo x={16} y={30} w={150} h={100} />
        <Thumbs x={16} y={136} n={4} />
        <rect x={178} y={26} width={126} height={124} rx="4" fill={surface} stroke={line} />
        <Text x={186} y={34} w={108} />
        <BuyBox x={184} y={72} w={114} h={72} />
        <Panel x={16} y={158} w={288} h={34} />
        <Lines x={24} y={166} w={270} n={3} gap={6} />
      </Frame>
    ),
  },
  {
    id: "marketplace",
    name: "Marketplace",
    tagline: "Gallery, details and a sticky buy box",
    description: "Three columns like a large retailer: a square gallery with thumbnails down the side, the description and a specification table in the middle, and a sticky buy box on the right.",
    bestFor: ["Parts and technical products with specs", "Stores using the Marketplace shop layout", "Comparison shoppers"],
    features: ["Square gallery with side thumbnails", "Specification table", "Sticky buy box with quantity and shipping notes", "Related items and reviews below"],
    Wireframe: () => (
      <Frame>
        <Header w={320} />
        <Thumbs x={12} y={28} n={4} vertical />
        <Photo x={26} y={28} w={96} h={96} />
        <Text x={132} y={30} w={90} />
        <Panel x={132} y={70} w={90} h={56} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={138} y={78 + i * 12} width="26" height="2.5" rx="1.25" fill={muted} opacity="0.5" />
            <rect x={170} y={78 + i * 12} width="46" height="2.5" rx="1.25" fill={ink} opacity="0.6" />
          </g>
        ))}
        <BuyBox x={232} y={28} w={76} h={98} />
        <Grid x={12} y={140} w={296} h={48} cols={5} rows={1} />
      </Frame>
    ),
  },
  {
    id: "split",
    name: "Split",
    tagline: "Sticky image half, scrolling detail half",
    description: "Half the screen is the product photo, pinned while the other half scrolls through the title, options, description and specs. Big, calm and image-led.",
    bestFor: ["Beautiful products with strong photography", "Furniture, apparel, premium goods", "Boutique stores"],
    features: ["Full-height sticky image", "Large typography", "Inline buy controls", "Spec table"],
    Wireframe: () => (
      <Frame>
        <Header w={320} />
        <Photo x={8} y={24} w={148} h={168} />
        <Text x={170} y={34} w={130} />
        <rect x={170} y={68} width={50} height="6" rx="3" fill={accent} opacity="0.8" />
        <rect x={170} y={80} width="18" height="7" rx="3.5" fill="var(--background)" stroke={line} />
        <rect x={192} y={80} width="18" height="7" rx="3.5" fill={accent} opacity="0.9" />
        <rect x={214} y={80} width="18" height="7" rx="3.5" fill="var(--background)" stroke={line} />
        <rect x={170} y={94} width={100} height="9" rx="3" fill={accent} opacity="0.95" />
        <Lines x={170} y={114} w={130} n={5} gap={6} />
        <Panel x={170} y={150} w={130} h={40} />
        <Lines x={178} y={158} w={114} n={3} gap={7} />
      </Frame>
    ),
  },
  {
    id: "showcase",
    name: "Showcase",
    tagline: "Full-bleed hero, then the details",
    description: "Opens with an edge-to-edge hero photo carrying the product name and price, then settles into a detail column with a sticky buy box beside it.",
    bestFor: ["Flagship and hero products", "Launches and campaign pages", "Stores with cinematic imagery"],
    features: ["Wide hero with overlaid title and price", "Gallery, description and specs below", "Sticky buy box", "Related items and reviews"],
    Wireframe: () => (
      <Frame>
        <Header w={320} />
        <Photo x={8} y={22} w={304} h={78} hero />
        <rect x={8} y={62} width={304} height={38} rx="4" fill={ink} opacity="0.35" />
        <rect x={18} y={74} width={90} height="7" rx="3" fill="var(--background)" opacity="0.95" />
        <rect x={18} y={86} width={60} height="3" rx="1.5" fill="var(--background)" opacity="0.7" />
        <rect x={262} y={78} width={40} height="7" rx="3" fill="var(--background)" opacity="0.9" />
        <Photo x={8} y={108} w={120} h={60} />
        <Lines x={136} y={112} w={90} n={5} gap={6} />
        <BuyBox x={236} y={108} w={76} h={82} />
        <Thumbs x={8} y={174} n={5} />
      </Frame>
    ),
  },
  {
    id: "minimal",
    name: "Minimal",
    tagline: "One quiet centred column",
    description: "A single narrow column: photo, name, price, buy, then the description. No chrome, nothing competing with the product.",
    bestFor: ["Simple products with no options", "Small catalogs and single-product stores", "Digital goods and services"],
    features: ["Centred layout with a square photo", "Inline quantity and add to cart", "Spec table", "Related items and reviews"],
    Wireframe: () => (
      <Frame>
        <Header w={320} />
        <Photo x={110} y={26} w={100} h={80} />
        <rect x={125} y={114} width={70} height="6" rx="3" fill={ink} opacity="0.85" />
        <rect x={140} y={125} width={40} height="4" rx="2" fill={accent} opacity="0.8" />
        <rect x={112} y={136} width="20" height="8" rx="3" fill="var(--background)" stroke={line} />
        <rect x={136} y={136} width={72} height="8" rx="3" fill={accent} opacity="0.95" />
        <Lines x={100} y={154} w={120} n={4} gap={6} />
        <Panel x={100} y={180} w={120} h={12} />
      </Frame>
    ),
  },
];
