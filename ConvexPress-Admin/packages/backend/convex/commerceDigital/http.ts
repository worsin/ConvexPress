import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import type { LeaseProof, LeaseRead } from "./delivery";
import { handleDownloadBytes } from "./byteTransport";

const readLease = makeFunctionReference<"query", LeaseProof & { requestTime: number }, LeaseRead>("commerceDigital/delivery:readLease");
const startLease = makeFunctionReference<"mutation", LeaseProof, null>("commerceDigital/delivery:startLease");
export const downloadBytes = httpAction((ctx, request) => handleDownloadBytes(request, {
  authorize: args => ctx.runQuery(readLease, args),
  start: args => ctx.runMutation(startLease, args),
  fetch,
}));
