import { useMemo, type ReactNode } from "react";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { ProductionFormEmbedProvider } from "../src/templates/sdk/block-renderer/form-embed-production";

/** Isolated visual fixture. No network client, backend URL, stored entries or
 * delivery exists here. The actual production host and controls are exercised. */
export function ContactInteractiveDemo({ children }: { children: ReactNode }) {
  const client = useMemo(() => ({
    mutation: async (reference: Parameters<typeof getFunctionName>[0], args: {values?: {fieldKey:string;value:string}[]}) => {
      const name = getFunctionName(reference);
      if (name === "extensions/forms/analytics:recordFunnelPublic") return null;
      if (name !== "extensions/forms/mutations:submit") throw Error("Unsupported demo operation");
      await new Promise(resolve => window.setTimeout(resolve, 900));
      if (args.values?.some(field => field.value === "error@example.invalid")) throw Error("Demo delivery is temporarily unavailable. Try again.");
      return { submissionId: "synthetic-demo", isComplete: true, confirmationToken: "synthetic-receipt" };
    },
    query: async (reference: Parameters<typeof getFunctionName>[0]) => {
      if (getFunctionName(reference) !== "extensions/forms/confirmations:resolveConfirmation") throw Error("Unsupported demo query");
      return { type: "message", renderedMessage: "<p>Your demo message was received. Nothing was sent or stored.</p>" };
    },
  }) as unknown as ConvexReactClient, []);
  return <ConvexProvider client={client}><ProductionFormEmbedProvider>{children}</ProductionFormEmbedProvider></ConvexProvider>;
}
