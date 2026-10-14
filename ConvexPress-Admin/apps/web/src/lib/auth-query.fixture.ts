import { api } from "@backend/convex/_generated/api";
import { getFunctionName } from "convex/server";

// Compare by reference, not by a literal "module:function" path: a host that
// mounts ConvexPress under a namespace changes every function's path.
const CURRENT_USER = getFunctionName(api.users.getCurrentUser);
const CURRENT_ROLE_ACCESS = getFunctionName(api.users.getCurrentRoleAccess);
/** The only queries the auth context may make. */
export const AUTH_QUERY_NAMES = [CURRENT_USER, CURRENT_ROLE_ACCESS];
let values: {user?: unknown; access?: unknown} = {};
export const requests: {refresh?:number}[] = [];
export const queryNames: string[] = [];
export function setValues(next: typeof values) { values = next; }
export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: {refresh?:number}) {
  const name = getFunctionName(reference);queryNames.push(name);
  if(name === CURRENT_USER) return values.user;
  if(name === CURRENT_ROLE_ACCESS) {requests.push(args ?? {});return values.access;}
  throw Error("Unexpected auth query: " + name);
}
