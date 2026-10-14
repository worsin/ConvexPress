/**
 * Addresses loader: the getMyAddresses query and the add / update / delete /
 * setDefault mutations with their toasts, handed to the `dashboard.addresses`
 * surface. (This page has no plugin gate of its own, as before; the registry
 * hides it when commerce is off.)
 */
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import CoreDashboardAddresses, {
  type DashboardAddressFormData,
  type DashboardAddressesSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.addresses";
import { Surface } from "@/templates/sdk/Surface";
import { idFromString } from "@/lib/ids";

function optionalFields(data: DashboardAddressFormData) {
  return {
    ...(data.firstName ? { firstName: data.firstName } : {}),
    ...(data.lastName ? { lastName: data.lastName } : {}),
    ...(data.company ? { company: data.company } : {}),
    ...(data.line2 ? { line2: data.line2 } : {}),
    ...(data.state ? { state: data.state } : {}),
    ...(data.phone ? { phone: data.phone } : {}),
  };
}

export function DashboardAddressesPage() {
  const addresses = useQuery(
    api.commerce.customers.getMyAddresses,
    {},
  );

  const addAddress = useMutation(api.commerce.customers.addAddress);
  const updateAddress = useMutation(api.commerce.customers.updateAddress);
  const deleteAddress = useMutation(api.commerce.customers.deleteAddress);
  const setDefaultAddress = useMutation(api.commerce.customers.setDefaultAddress);

  const [busy, setBusy] = useState(false);

  async function add(data: DashboardAddressFormData): Promise<boolean> {
    setBusy(true);
    try {
      await addAddress({
        addressType: data.addressType,
        label: data.label,
        line1: data.line1,
        city: data.city,
        postalCode: data.postalCode,
        countryCode: data.countryCode,
        ...optionalFields(data),
        setAsDefault: !addresses || addresses.length === 0,
      });
      toast.success("Address added");
      return true;
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to add address",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function update(addressId: string, data: DashboardAddressFormData): Promise<boolean> {
    setBusy(true);
    try {
      await updateAddress({
        addressId: idFromString<"commerce_customer_addresses">(addressId),
        addressType: data.addressType,
        label: data.label,
        line1: data.line1,
        city: data.city,
        postalCode: data.postalCode,
        countryCode: data.countryCode,
        ...optionalFields(data),
      });
      toast.success("Address updated");
      return true;
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to update address",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(addressId: string) {
    try {
      await deleteAddress({ addressId: idFromString<"commerce_customer_addresses">(addressId) });
      toast.success("Address deleted");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to delete address",
      );
    }
  }

  async function setDefault(addressId: string, type: "billing" | "shipping") {
    try {
      await setDefaultAddress({
        addressId: idFromString<"commerce_customer_addresses">(addressId),
        addressType: type,
      });
      toast.success(`Set as default ${type} address`);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to set default",
      );
    }
  }

  const data: DashboardAddressesSurfaceData = {
    addresses,
    busy,
    actions: { add, update, remove, setDefault },
  };

  return <Surface name="dashboard.addresses" data={data} fallback={CoreDashboardAddresses} />;
}
