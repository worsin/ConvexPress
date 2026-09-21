# Control-plane worker headroom

`node scripts/standalone/check-control-capacity.mjs` reads one JSON object from stdin, performs no network or Docker calls, and returns only four numeric knobs and its assessment. Supply `{ "imageRevision": "abdd9b30f89c0e7c18c4213b99cd10e4bad33f8c", "environment": { ... } }`; environment may also be a Docker-style `NAME=value` array. Unrelated values are ignored and never printed. Do not put credentials in arguments or persist an unfiltered Docker inspection.

The guard rejects non-positive/non-integer knobs, duplicate recognized entries, unknown image revisions, and pools without room beyond the sum of admitted query, mutation, and V8 action calls. Missing knobs use defaults verified for the exact revision only. Exit 0 means **headroom present**, not verified workload capacity. Exit 1 means unsafe, invalid input, or unverified image. Deep nested calls, parallel component calls, deployment analysis, and actual memory remain explicit acceptance checks.

Verified source for the deployed image:

- [Nested UDF execution, lines 1084–1109](https://github.com/get-convex/convex-backend/blob/abdd9b30f89c0e7c18c4213b99cd10e4bad33f8c/crates/isolate/src/client.rs#L1084): nested calls use another isolate and await the result.
- [Scheduler, lines 1242–1255](https://github.com/get-convex/convex-backend/blob/abdd9b30f89c0e7c18c4213b99cd10e4bad33f8c/crates/isolate/src/client.rs#L1242): when every worker is busy it processes expirations instead of starting queued requests. This revision has no separate prioritized nested-request queue.
- [Pool default, lines 729–731](https://github.com/get-convex/convex-backend/blob/abdd9b30f89c0e7c18c4213b99cd10e4bad33f8c/crates/common/src/knobs.rs#L729): 300 workers. Query/mutation defaults are 16 each, V8 action default 64.

The observed test-fleet configuration was workers 8, queries 8, mutations 8, V8 actions 4. Parent's controlled comparison changed only workers to 32. The native Staging Operations view loaded in 949 ms, including receipt, backups, history, and maintenance, with no console errors; a policy edit persisted and was restored. Observed CP usage after restart was 565 MiB of a 3 GiB limit and 0% CPU. Query and mutation limits remained 8. This identifies worker starvation as the decisive fault in that workload, not ordinary request capacity.

The actual Docker compose lives outside this repository. No runtime configuration is changed by this doctor. Before applying to another site, inspect that site's image and numeric knobs, run this guard locally, and measure the real nested workload and memory after any separately authorized change. Do not copy the test-fleet worker count to unrelated deployments as an unconditional tuning rule.

Tests: `node --test scripts/standalone/lib/control-capacity.test.mjs`.
