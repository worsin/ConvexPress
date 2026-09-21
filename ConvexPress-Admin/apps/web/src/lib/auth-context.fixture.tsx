import { AuthProvider, useAuth } from "./auth-context";
export { setValues, requests, queryNames } from "./auth-query.fixture";
function Controls() {
  const auth = useAuth();
  return <pre id="state">{JSON.stringify({ai:auth.can("blocks.ai"),page:auth.can("page.update"),route:auth.canAccessRoute("/pages"),loading:auth.isLoading})}</pre>;
}
export function App() {return <AuthProvider><Controls/></AuthProvider>;}
