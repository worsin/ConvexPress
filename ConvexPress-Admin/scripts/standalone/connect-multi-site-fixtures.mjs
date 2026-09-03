// Compatibility entry point. The Linux fleet bootstrap now configures identities,
// attaches instances, and creates their encrypted management connections together.
await import("./bootstrap-linux-fleet.mjs");
