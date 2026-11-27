import { getCustomer, getVendor } from "./queries";
import type { CustomerSnapshot, VendorSnapshot } from "./schema";

export async function buildCustomerSnapshot(customerId: number): Promise<CustomerSnapshot> {
  const c = await getCustomer(customerId);
  if (!c) throw new Error(`Kunde ${customerId} nicht gefunden.`);
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
  if (!v) throw new Error(`Lieferant ${vendorId} nicht gefunden.`);
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
