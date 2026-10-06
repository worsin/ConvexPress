import type { CSSOptions } from "vite";
type InlinePostcss = Exclude<NonNullable<CSSOptions["postcss"]>, string>;
export function typeScale(): NonNullable<InlinePostcss["plugins"]>[number];
