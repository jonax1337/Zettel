import type { Customer } from "$lib/db/schema";

const HOME_COUNTRY = "DE";

export type ContactFact = { label: string; lines: string[] };

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames("de", { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Street, "PLZ Ort" and, abroad, the country; empty parts are left out. */
export function addressLines(customer: Pick<Customer, "street" | "postalCode" | "city" | "country">): string[] {
  const town = [customer.postalCode, customer.city].filter(Boolean).join(" ");
  const country = customer.country && customer.country !== HOME_COUNTRY ? countryName(customer.country) : "";
  return [customer.street, town, country].filter(Boolean);
}

/** The facts the customer page lists under "Kontakt"; a fact that is not filled in is left out. */
export function contactFacts(
  customer: Pick<
    Customer,
    "contactPerson" | "email" | "phone" | "street" | "postalCode" | "city" | "country" | "vatId" | "leitwegId" | "receivesXrechnung"
  >,
): ContactFact[] {
  const facts: ContactFact[] = [
    { label: "Ansprechpartner", lines: [customer.contactPerson ?? ""] },
    { label: "E-Mail", lines: [customer.email ?? ""] },
    { label: "Telefon", lines: [customer.phone ?? ""] },
    { label: "Anschrift", lines: addressLines(customer) },
    { label: "USt-IdNr.", lines: [customer.vatId ?? ""] },
    { label: "Leitweg-ID", lines: [customer.leitwegId ?? ""] },
    { label: "XRechnung", lines: customer.receivesXrechnung ? ["Wird beliefert"] : [] },
  ];
  return facts
    .map((fact) => ({ ...fact, lines: fact.lines.map((line) => line.trim()).filter(Boolean) }))
    .filter((fact) => fact.lines.length > 0);
}
