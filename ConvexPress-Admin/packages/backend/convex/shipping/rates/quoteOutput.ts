import type { NormalizedShippingQuote } from "./types";

/** Rate results leave the rating code without the carrier's raw payload. */
export type PipelineQuote = Omit<NormalizedShippingQuote, "rawQuote">;

export function withoutRawQuote(quote: NormalizedShippingQuote): PipelineQuote {
  const { rawQuote: _rawQuote, ...rest } = quote;
  return rest;
}
