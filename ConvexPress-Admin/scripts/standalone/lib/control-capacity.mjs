/** Necessary worker-headroom check, not a load test or automatic tuning policy. */
export const VERIFIED_IMAGE_REVISION = "abdd9b30f89c0e7c18c4213b99cd10e4bad33f8c";
export const VERIFIED_DEFAULTS = Object.freeze({
  MAX_ISOLATE_WORKERS: 300,
  APPLICATION_MAX_CONCURRENT_QUERIES: 16,
  APPLICATION_MAX_CONCURRENT_MUTATIONS: 16,
  APPLICATION_MAX_CONCURRENT_V8_ACTIONS: 64,
});
const names = Object.keys(VERIFIED_DEFAULTS);

/** Input is local configuration supplied on stdin. No Docker, network, or process calls. */
export function assessControlCapacity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { status: "invalid", code: "EXPECTED_CONFIGURATION_OBJECT", workloadVerified: false };
  if (input.imageRevision !== VERIFIED_IMAGE_REVISION)
    return { status: "unverified-image", code: "VERIFY_SCHEDULER_AND_DEFAULTS_FOR_IMAGE", workloadVerified: false };
  const supplied = input.environment;
  if (!supplied || typeof supplied !== "object")
    return { status: "invalid", code: "EXPECTED_ENVIRONMENT", workloadVerified: false };
  const values = new Map();
  if (Array.isArray(supplied)) {
    for (const entry of supplied) {
      if (typeof entry !== "string")
        return { status: "invalid", code: "INVALID_ENVIRONMENT_ENTRY", workloadVerified: false };
      const separator = entry.indexOf("=");
      const key = separator < 0 ? entry : entry.slice(0, separator);
      if (!names.includes(key)) continue;
      if (separator < 0 || values.has(key))
        return { status: "invalid", code: "DUPLICATE_OR_INVALID_KNOB", knob: key, workloadVerified: false };
      values.set(key, entry.slice(separator + 1));
    }
  } else {
    for (const key of names) if (Object.hasOwn(supplied, key)) values.set(key, supplied[key]);
  }
  const limits = {};
  for (const key of names) {
    const raw = values.has(key) ? values.get(key) : VERIFIED_DEFAULTS[key];
    if ((typeof raw !== "number" && typeof raw !== "string") || !/^[1-9][0-9]*$/u.test(String(raw)) || !Number.isSafeInteger(Number(raw)))
      return { status: "invalid", code: "EXPECTED_POSITIVE_INTEGER_KNOB", knob: key, workloadVerified: false };
    limits[key] = Number(raw);
  }
  const outerAdmission = limits.APPLICATION_MAX_CONCURRENT_QUERIES + limits.APPLICATION_MAX_CONCURRENT_MUTATIONS + limits.APPLICATION_MAX_CONCURRENT_V8_ACTIONS;
  if (!Number.isSafeInteger(outerAdmission))
    return { status: "invalid", code: "CONCURRENCY_TOTAL_OVERFLOW", workloadVerified: false };
  const spareWorkers = limits.MAX_ISOLATE_WORKERS - outerAdmission;
  return {
    status: spareWorkers > 0 ? "headroom-present" : "unsafe",
    code: spareWorkers > 0 ? "VERIFY_NESTED_WORKLOAD_AND_MEMORY" : "NESTED_UDF_WORKER_STARVATION_RISK",
    imageRevision: VERIFIED_IMAGE_REVISION,
    limits, outerAdmission, spareWorkers,
    workloadVerified: false,
    explanation: spareWorkers > 0
      ? "The pool has room beyond admitted outer calls. Deep or parallel nested calls and deployment analysis still require measured headroom; this is not a production load-test result."
      : "Admitted outer calls can occupy every worker while waiting for component calls. Review worker headroom without increasing application request concurrency.",
  };
}
