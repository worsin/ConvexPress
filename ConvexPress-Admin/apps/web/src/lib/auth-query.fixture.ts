import { getFunctionName } from "convex/server";
let values: {user?: unknown; access?: unknown} = {};
export const requests: {refresh?:number}[] = [];
export const queryNames: string[] = [];
export function setValues(next: typeof values) { values = next; }
export function useQuery(reference: Parameters<typeof getFunctionName>[0], args?: {refresh?:number}) {
  const name = getFunctionName(reference);queryNames.push(name);
  if(name === "users:getCurrentUser") return values.user;
  if(name === "users:getCurrentRoleAccess") {requests.push(args ?? {});return values.access;}
  throw Error("Unexpected auth query: " + name);
}
