/**
 * PRD A7 Rate Calculation Pipeline — shared types.
 *
 * The pipeline orchestrates rate calculation across Layer A (zones, classes,
 * packages, ship-from, rules) and Layer B methods / Layer C providers.
 *
 * Contract matches PRD B10 NormalizedShippingQuote + adds pipeline-specific
 * diagnostic fields.
 */

import type { RuleContext } from "../rulesEngine/types";

export type NormalizedShippingQuote = {
  quoteKey: string;
  provider: "shipstation" | "ups" | "usps" | "fedex" | "dhl" | "manual";
  carrierCode: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  currency: string;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  deliveryDateEstimated?: number;
  isCheapest: boolean;
  isFastest: boolean;
  isBestValue: boolean;
  rawQuote?: unknown;
  addressKey?: string;
  cartKey?: string;
  expiresAt: number;
};

export type PipelineStageTiming = {
  stage: string;
  startedAt: number;
  durationMs: number;
  success: boolean;
  detail?: string;
};

export type PipelineRunDiagnostic = {
  runId: string;
  checkoutSessionId?: string;
  requestedAt: number;
  totalDurationMs: number;
  stages: PipelineStageTiming[];
  matchedZoneId?: string;
  matchedZoneName?: string;
  fellBackToManual: boolean;
  totalQuotes: number;
  providerResults: Array<{
    provider: string;
    success: boolean;
    quoteCount: number;
    durationMs: number;
    error?: string;
  }>;
};

export type MethodRateCalculator<TConfig = any> = {
  methodType: string;
  calculate(
    config: TConfig,
    context: RuleContext,
  ): NormalizedShippingQuote[] | Promise<NormalizedShippingQuote[]>;
};
