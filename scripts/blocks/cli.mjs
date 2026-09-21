import { syncBlocks } from "./generator.mjs";
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--check")) throw new Error("Usage: node scripts/blocks/cli.mjs [--check]");
try {
  const result = await syncBlocks({ check: args.includes("--check") });
  console.log(`Block foundation: ${result.blocks} specifications, ${result.packs} discovered packs; ${result.changed.length} generated files changed. Runtime activation is separate.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
