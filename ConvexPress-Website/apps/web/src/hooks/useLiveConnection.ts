import { useCallback, useSyncExternalStore } from "react";
import { useConvex } from "convex/react";

const serverSnapshot = () => false;

/** Convex's connectionState() initializes its lazy WebSocket transport. Never
 * call it during SSR or the first hydration render; those have no live client. */
export function useLiveConnection() {
  const client = useConvex();
  const subscribe = useCallback((changed: () => void) => client.subscribeToConnectionState(changed), [client]);
  const snapshot = useCallback(() => client.connectionState().isWebSocketConnected, [client]);
  const isWebSocketConnected = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { isWebSocketConnected };
}
