import type { Customer, Settings } from "$lib/db/schema";

const HOME_COUNTRY = "DE";

type AddressParty = Pick<Customer, "street" | "postalCode" | "city">;

/** The sender line above the address window, as on the printed letter. */
export function senderLine(company: Pick<Settings, "companyName"> & AddressParty): string {
  return [company.companyName, company.street, [company.postalCode, company.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["de"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Address block of a customer; the country appears only when it is not the home country. */
export function customerAddressLines(
  customer: Pick<Customer, "name" | "contactPerson" | "country"> & AddressParty,
): string[] {
  const country = customer.country.toUpperCase();
  return [
    customer.name,
    customer.contactPerson,
    customer.street,
    [customer.postalCode, customer.city].filter(Boolean).join(" "),
    country && country !== HOME_COUNTRY ? countryName(country) : null,
  ].filter((line): line is string => !!line);
}
