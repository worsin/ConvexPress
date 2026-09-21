/** Recognize the structured controller error without displaying arbitrary error data. */
export function isAuthorizationCapacityError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("data" in error)) return false;
  const data = error.data;
  if (!data || typeof data !== "object" || !("code" in data)) return false;
  if (data.code === "CONTROL_PLANE_AUTHORIZATION_CAPACITY") return true;
  // Existing controllers predate the dedicated code; retain rolling-update recovery.
  return data.code === "CONTROL_PLANE_OPERATION_FAILED" && "message" in data &&
    data.message === "Authorization rule limit exceeded; narrow the operator's grants or permission catalog";
}

export const authorizationCapacityTitle = "Permission limit reached";
export const authorizationCapacityMessage =
  "Access is paused because there are too many permission rules to verify safely. Ask your installation administrator to reduce or consolidate the affected rules, then try again.";
