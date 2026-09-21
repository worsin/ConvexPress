import { assessControlCapacity } from "./lib/control-capacity.mjs";
// Deliberately stdin-only: Docker inspect can contain credentials. Never echo input/errors.
let body = "";
try {
  for await (const chunk of process.stdin) {
    body += chunk.toString("utf8");
    if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("Input too large");
  }
  const result = assessControlCapacity(JSON.parse(body));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "headroom-present" ? 0 : 1;
} catch {
  process.stdout.write('{"status":"invalid","code":"EXPECTED_BOUNDED_JSON_CONFIGURATION","workloadVerified":false}\n');
  process.exitCode = 1;
}
