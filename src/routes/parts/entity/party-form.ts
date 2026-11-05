import type { Customer } from "$lib/db/schema";

/** Fields customers and vendors have in common. */
export type PartyFields = Pick<
  Customer,
  "name" | "contactPerson" | "street" | "postalCode" | "city" | "country" | "email" | "phone" | "vatId" | "notes"
>;

export const DEFAULT_PARTY_COUNTRY = "DE";

export function emptyPartyFields(): PartyFields {
  return {
    name: "",
    contactPerson: null,
    street: "",
    postalCode: "",
    city: "",
    country: DEFAULT_PARTY_COUNTRY,
    email: null,
    phone: null,
    vatId: null,
    notes: null,
  };
}

export function partyFieldsFrom(source: PartyFields): PartyFields {
  return {
    name: source.name,
    contactPerson: source.contactPerson,
    street: source.street,
    postalCode: source.postalCode,
    city: source.city,
    country: source.country,
    email: source.email,
    phone: source.phone,
    vatId: source.vatId,
    notes: source.notes,
  };
}
