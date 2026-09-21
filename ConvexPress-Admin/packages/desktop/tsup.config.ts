import { defineConfig } from "tsup";
export default defineConfig({
  // Native installers must carry shared provider and protocol code in main.js,
  // not resolve a workspace TypeScript source file at runtime.
  noExternal: [/^@convexpress\/(?:runtime-clients|site-contract)(?:\/|$)/],
});
