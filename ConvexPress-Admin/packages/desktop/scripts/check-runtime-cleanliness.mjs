import { inspectRuntimeCleanliness } from "./lib/runtime-cleanliness.mjs";

const result = await inspectRuntimeCleanliness();
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.clean) process.exitCode = 1;
