// This entry point intentionally performs no environment, network, storage or database work.
console.error(
  "The legacy marketing-site seed has been retired because it erased existing content and wrote the old document format. " +
  "Create pages/posts through the canonical editor or HTTP API and use the supported template workflow. " +
  "The separate seed-demo-shop.ts workflow is unchanged."
);
process.exitCode = 1;
