import { expect, mock } from "bun:test";
const test = (_name, run) => run();
import { anyApi, getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@control/convex/_generated/api", () => ({ api: anyApi }));
let replies = new Map();
let calls = [];
mock.module("convex/react", () => ({
  useMutation: () => async () => {},
  useQuery: (reference, args) => {
    const name = getFunctionName(reference);
    calls.push({ name, args });
    return args === "skip" ? undefined : replies.get(name);
  },
  usePaginatedQuery: (reference, args) => {
    const name = getFunctionName(reference);
    calls.push({ name, args });
    return (args !== "skip" && replies.get(name)) || {
      status: "LoadingFirstPage", results: [], loadMore: () => {},
    };
  },
}));
const { LifecyclePanel } = await import("./LifecyclePanel");
const instance = { instanceId: "instance-alpha", instanceKey: "alpha", kind: "staging", label: null };
function render() {
  calls = [];
  renderToStaticMarkup(<LifecyclePanel open instance={instance} environments={[instance]} onClose={() => {}} onEnvironmentReplaced={() => {}} />);
  return calls.filter(call => call.args !== "skip").map(call => call.name);
}
const operations = "operations/queries:pageForInstance";
const backups = "operations/queries:pageBackupsForInstance";
const maintenance = "fleet/queries:get";
const history = "fleet/queries:history";
const page = (status = "Exhausted") => ({ status, results: [], loadMore: () => {} });

test("real lifecycle render starts one cold auth query and opens subsequent sections only after results", () => {
  replies = new Map();
  expect(render()).toEqual([operations]);
  replies.set(operations, page());
  expect(render()).toEqual([operations, backups]);
  replies.set(backups, page());
  expect(render()).toEqual([operations, backups, maintenance]);
  replies.set(maintenance, { canManage: true, policy: null, incidents: [] });
  expect(render()).toEqual([operations, backups, maintenance, history]);
  // Later page loads retain all established subscriptions, rather than resetting the panel.
  replies.set(operations, page("LoadingMore"));
  replies.set(backups, page("CanLoadMore"));
  expect(render()).toEqual([operations, backups, maintenance, history]);
});

test("closing the actual panel releases every panel subscription", () => {
  calls = [];
  renderToStaticMarkup(<LifecyclePanel open={false} instance={instance} environments={[instance]} onClose={() => {}} onEnvironmentReplaced={() => {}} />);
  expect(calls).toEqual([]);
});
