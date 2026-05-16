import { execute, select } from "./client";
import type { Customer, Settings } from "./schema";

// --- Settings (singleton row id=1) ---

type SettingsRow = {
  id: number;
  company_name: string;
  owner_name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  tax_number: string;
  vat_id: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
  is_kleinunternehmer: number;
  kleinunternehmer_note: string;
  invoice_number_format: string;
  invoice_number_counter: number;
  default_payment_terms_days: number;
  logo_path: string | null;
  zugferd_profile: string;
  created_at: number;
  updated_at: number;
};

function mapSettings(r: SettingsRow): Settings {
  return {
    id: r.id,
    companyName: r.company_name,
    ownerName: r.owner_name,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    taxNumber: r.tax_number,
    vatId: r.vat_id,
    email: r.email,
    phone: r.phone,
    website: r.website,
    bankName: r.bank_name,
    bankIban: r.bank_iban,
    bankBic: r.bank_bic,
    isKleinunternehmer: r.is_kleinunternehmer === 1,
    kleinunternehmerNote: r.kleinunternehmer_note,
    invoiceNumberFormat: r.invoice_number_format,
    invoiceNumberCounter: r.invoice_number_counter,
    defaultPaymentTermsDays: r.default_payment_terms_days,
    logoPath: r.logo_path,
    zugferdProfile: (r.zugferd_profile ?? "en16931") as Settings["zugferdProfile"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function loadSettings(): Promise<Settings> {
  const rows = await select<SettingsRow>(
    "SELECT * FROM settings WHERE id = 1",
  );
  if (rows.length === 0) {
    await execute("INSERT INTO settings (id) VALUES (1)");
    return loadSettings();
  }
  return mapSettings(rows[0]);
}

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  await execute(
    `UPDATE settings SET
      company_name = ?,
      owner_name = ?,
      street = ?,
      postal_code = ?,
      city = ?,
      country = ?,
      tax_number = ?,
      vat_id = ?,
      email = ?,
      phone = ?,
      website = ?,
      bank_name = ?,
      bank_iban = ?,
      bank_bic = ?,
      is_kleinunternehmer = ?,
      kleinunternehmer_note = ?,
      invoice_number_format = ?,
      invoice_number_counter = ?,
      default_payment_terms_days = ?,
      logo_path = ?,
      zugferd_profile = ?,
      updated_at = unixepoch()
    WHERE id = 1`,
    [
      s.companyName ?? "",
      s.ownerName ?? "",
      s.street ?? "",
      s.postalCode ?? "",
      s.city ?? "",
      s.country ?? "DE",
      s.taxNumber ?? "",
      s.vatId ?? null,
      s.email ?? "",
      s.phone ?? null,
      s.website ?? null,
      s.bankName ?? "",
      s.bankIban ?? "",
      s.bankBic ?? "",
      s.isKleinunternehmer ? 1 : 0,
      s.kleinunternehmerNote ?? "",
      s.invoiceNumberFormat ?? "RE-{YYYY}-{NNNN}",
      s.invoiceNumberCounter ?? 0,
      s.defaultPaymentTermsDays ?? 14,
      s.logoPath ?? null,
      s.zugferdProfile ?? "en16931",
    ],
  );
}

// --- Customers ---

type CustomerRow = {
  id: number;
  customer_number: string;
  name: string;
  contact_person: string | null;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

function mapCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    customerNumber: r.customer_number,
    name: r.name,
    contactPerson: r.contact_person,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    email: r.email,
    phone: r.phone,
    vatId: r.vat_id,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listCustomers(search = ""): Promise<Customer[]> {
  if (search.trim() === "") {
    const rows = await select<CustomerRow>(
      "SELECT * FROM customers ORDER BY name COLLATE NOCASE ASC",
    );
    return rows.map(mapCustomer);
  }
  const q = `%${search.trim()}%`;
  const rows = await select<CustomerRow>(
    `SELECT * FROM customers
     WHERE name LIKE ?1 OR customer_number LIKE ?1 OR city LIKE ?1 OR email LIKE ?1
     ORDER BY name COLLATE NOCASE ASC`,
    [q],
  );
  return rows.map(mapCustomer);
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const rows = await select<CustomerRow>(
    "SELECT * FROM customers WHERE id = ?",
    [id],
  );
  return rows.length ? mapCustomer(rows[0]) : null;
}

async function nextCustomerNumber(): Promise<string> {
  // Format: K-0001, K-0002 ... derived from MAX existing numeric suffix.
  const rows = await select<{ customer_number: string }>(
    "SELECT customer_number FROM customers WHERE customer_number LIKE 'K-%'",
  );
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.customer_number.slice(2), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `K-${String(max + 1).padStart(4, "0")}`;
}

export type CustomerInput = Omit<
  Customer,
  "id" | "customerNumber" | "createdAt" | "updatedAt"
> & { customerNumber?: string };

export async function createCustomer(input: CustomerInput): Promise<number> {
  const number = input.customerNumber ?? (await nextCustomerNumber());
  const res = await execute(
    `INSERT INTO customers
      (customer_number, name, contact_person, street, postal_code, city, country, email, phone, vat_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      number,
      input.name,
      input.contactPerson ?? null,
      input.street,
      input.postalCode,
      input.city,
      input.country,
      input.email ?? null,
      input.phone ?? null,
      input.vatId ?? null,
      input.notes ?? null,
    ],
  );
  return Number(res.lastInsertId ?? 0);
}

export async function updateCustomer(
  id: number,
  input: CustomerInput,
): Promise<void> {
  await execute(
    `UPDATE customers SET
      name = ?, contact_person = ?, street = ?, postal_code = ?, city = ?,
      country = ?, email = ?, phone = ?, vat_id = ?, notes = ?,
      updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.name,
      input.contactPerson ?? null,
      input.street,
      input.postalCode,
      input.city,
      input.country,
      input.email ?? null,
      input.phone ?? null,
      input.vatId ?? null,
      input.notes ?? null,
      id,
    ],
  );
}

export async function deleteCustomer(id: number): Promise<void> {
  await execute("DELETE FROM customers WHERE id = ?", [id]);
}
