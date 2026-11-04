import { getCustomer, getVendor } from "./queries";
import type { CustomerSnapshot, VendorSnapshot } from "./schema";

export async function buildCustomerSnapshot(customerId: number): Promise<CustomerSnapshot> {
  const c = await getCustomer(customerId);
  if (!c) throw new Error(`Customer ${customerId} not found`);
  return {
    customerNumber: c.customerNumber,
    name: c.name,
    contactPerson: c.contactPerson,
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    country: c.country,
    email: c.email,
    vatId: c.vatId,
  };
}

export async function buildVendorSnapshot(vendorId: number): Promise<VendorSnapshot> {
  const v = await getVendor(vendorId);
  if (!v) throw new Error(`Vendor ${vendorId} not found`);
  return {
    vendorNumber: v.vendorNumber,
    name: v.name,
    contactPerson: v.contactPerson,
    street: v.street,
    postalCode: v.postalCode,
    city: v.city,
    country: v.country,
    email: v.email,
    vatId: v.vatId,
  };
}
