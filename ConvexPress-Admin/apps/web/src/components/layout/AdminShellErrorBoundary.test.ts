import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAuthorizationCapacityError } from "../../lib/authorization-capacity";

test("unknown failures do not imply a permission capacity diagnosis", () => {
  for (const error of [null, "Permission limit reached", new Error("Authorization rule limit exceeded"), {data:null}, {data:{code:"CONTROL_PLANE_OPERATION_FAILED",message:"Access denied"}}, {data:{code:"UNRELATED",message:"Authorization rule limit exceeded; narrow the operator's grants or permission catalog"}}]) {
    expect(isAuthorizationCapacityError(error)).toBe(false);
  }
});

test("both boundaries retain fail-closed recovery for current and older controllers", () => {
  const result = spawnSync(process.execPath, ["test",fileURLToPath(new URL("./AdminShellErrorBoundary.cases.tsx",import.meta.url))], {encoding:"utf8",timeout:30000});
  if(result.status!==0) throw new Error(result.stdout+result.stderr);
  expect(result.status).toBe(0);
});
