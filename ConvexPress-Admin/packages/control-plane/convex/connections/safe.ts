export function safeConnectionSummary<ConnectionId>(connection: {
  _id: ConnectionId;
  name: string;
  serviceId: string;
  provider: string;
  category?: string;
  accountEmail?: string;
  accountLabel?: string;
  status: string;
  isActive: boolean;
  updatedAt: number;
  credentials?: { version?: number };
  config?: unknown;
}) {
  return {
    connectionId: connection._id,
    name: connection.name,
    serviceId: connection.serviceId,
    provider: connection.provider,
    category: connection.category ?? null,
    accountEmail: connection.accountEmail ?? null,
    accountLabel: connection.accountLabel ?? null,
    status: connection.status,
    isActive: connection.isActive,
    hasCredentials: Boolean(connection.credentials),
    credentialVersion: connection.credentials?.version ?? null,
    updatedAt: connection.updatedAt,
  };
}
