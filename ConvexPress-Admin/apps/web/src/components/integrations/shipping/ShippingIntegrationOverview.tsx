import { ProviderConnectionCard } from "./ProviderConnectionCard";

export function ShippingIntegrationOverview(props: {
  providers:
    | Array<{
        provider: string;
        accountCount: number;
        connection: { status: string } | null;
        settings?: {
          enabled?: boolean;
          rateShoppingEnabled?: boolean;
          rateShoppingPriority?: number;
        };
        descriptor: {
          title: string;
          summary: string;
          implementationStatus: string;
          operations?: {
            rates?: string;
            labels?: string;
            tracking?: string;
            manifests?: string;
            returns?: string;
            address_validation?: string;
          };
        };
      }>
    | undefined;
}) {
  const providers = props.providers ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {providers.map((provider) => (
        <ProviderConnectionCard
          key={provider.provider}
          provider={provider.provider}
          title={provider.descriptor.title}
          description={provider.descriptor.summary}
          to={`/settings/integrations/shipping/${provider.provider}`}
          status={provider.connection?.status ?? "disconnected"}
          accountCount={provider.accountCount}
          implementationStatus={provider.descriptor.implementationStatus}
          operations={provider.descriptor.operations}
          footerNote={
            provider.settings?.rateShoppingEnabled
              ? `Rate shopping priority ${provider.settings.rateShoppingPriority ?? "?"}`
              : "Excluded from live rate shopping"
          }
        />
      ))}
    </div>
  );
}
